// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

/**
 * @title Enterprise Smart Contract Wallet
 * @dev EIP-4337 compatible smart contract wallet with social recovery
 * @notice Advanced wallet with multi-signature, social recovery, and enterprise features
 */
contract EnterpriseSmartWallet is 
    Initializable, 
    UUPSUpgradeable, 
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable 
{
    using ECDSA for bytes32;
    using SignatureChecker for address;

    // ========================================
    // State Variables
    // ========================================

    /// @dev EntryPoint contract address for EIP-4337
    address public immutable entryPoint;

    /// @dev Wallet implementation for upgrades
    address public immutable walletImplementation;

    /// @dev Array of guardian addresses for social recovery
    address[] public guardians;

    /// @dev Mapping of guardian status
    mapping(address => bool) public isGuardian;

    /// @dev Required number of guardians for recovery
    uint256 public requiredGuardians;

    /// @dev Recovery operation data
    struct RecoveryOperation {
        address newOwner;
        uint256 deadline;
        mapping(address => bool) hasApproved;
        uint256 approvalCount;
    }

    /// @dev Current recovery operation
    RecoveryOperation public currentRecovery;

    /// @dev Daily transaction limit for security
    uint256 public dailyLimit;

    /// @dev Daily spent amount
    uint256 public dailySpent;

    /// @dev Last reset timestamp for daily limit
    uint256 public lastReset;

    /// @dev Emergency pause state
    bool public paused;

    /// @dev Whitelisted contracts for gas sponsorship
    mapping(address => bool) public whitelistedContracts;

    // ========================================
    // Events
    // ========================================

    event GuardianAdded(address indexed guardian);
    event GuardianRemoved(address indexed guardian);
    event RecoveryInitiated(address indexed newOwner, uint256 deadline);
    event RecoveryCompleted(address indexed newOwner);
    event RecoveryCancelled();
    event DailySpentUpdated(uint256 amount);
    event ContractWhitelisted(address indexed contract);
    event ContractDewhitelisted(address indexed contract);
    event WalletPaused();
    event WalletUnpaused();

    // ========================================
    // Errors
    // ========================================

    error InvalidSignature();
    error InvalidGuardian();
    error RecoveryNotActive();
    error RecoveryExpired();
    error InsufficientApprovals();
    error DailyLimitExceeded();
    error ContractPaused();
    error Unauthorized();
    error InvalidEntryPoint();

    // ========================================
    // Modifiers
    // ========================================

    modifier whenNotPaused() {
        if (paused) revert ContractPaused();
        _;
    }

    modifier onlyEntryPoint() {
        if (msg.sender != entryPoint) revert InvalidEntryPoint();
        _;
    }

    modifier onlyGuardian() {
        if (!isGuardian[msg.sender]) revert InvalidGuardian();
        _;
    }

    // ========================================
    // Constructor
    // ========================================

    constructor(address _entryPoint, address _walletImplementation) {
        if (_entryPoint == address(0)) revert InvalidEntryPoint();
        entryPoint = _entryPoint;
        walletImplementation = _walletImplementation;
    }

    // ========================================
    // Initialization
    // ========================================

    /**
     * @dev Initialize the wallet with owner and initial settings
     * @param owner Initial wallet owner
     * @param _requiredGuardians Number of guardians needed for recovery
     * @param _dailyLimit Daily transaction limit in wei
     */
    function initialize(
        address owner,
        uint256 _requiredGuardians,
        uint256 _dailyLimit
    ) external initializer {
        __Ownable_init(owner);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();
        
        requiredGuardians = _requiredGuardians;
        dailyLimit = _dailyLimit;
        lastReset = block.timestamp;
        paused = false;
    }

    // ========================================
    // EIP-4337 Functions
    // ========================================

    /**
     * @dev Validate UserOperation from EntryPoint
     * @param userOp UserOperation data
     * @param userOpHash Hash of the UserOperation
     * @return validationData Packed validation data
     */
    function validateUserOp(
        UserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external view onlyEntryPoint returns (uint256 validationData) {
        // Check if wallet is not paused
        if (paused) {
            return 1; // Failed validation
        }

        // Check daily limit
        if (userOp.callValue > 0 && dailySpent + userOp.callValue > dailyLimit) {
            return 1; // Failed validation
        }

        // Verify signature
        bytes32 hash = ECDSA.toEthSignedMessageHash(userOpHash);
        address signer = hash.recover(userOp.signature);
        
        if (signer == owner()) {
            return 0; // Success
        }

        // Check if it's a guardian-approved recovery operation
        if (currentRecovery.newOwner != address(0) && signer == currentRecovery.newOwner) {
            return 0; // Success for recovery
        }

        return 1; // Failed validation
    }

    /**
     * @dev Execute UserOperation through EntryPoint
     * @param target Target contract address
     * @param value ETH value to send
     * @param data Call data
     */
    function executeUserOp(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyEntryPoint whenNotPaused nonReentrant {
        // Update daily spent if value > 0
        if (value > 0) {
            _updateDailySpent(value);
        }

        // Check if target is whitelisted for gas sponsorship
        bool isWhitelisted = whitelistedContracts[target];
        
        // Execute the call
        (bool success, bytes memory result) = target.call{value: value}(data);
        
        if (!success) {
            // Revert with error data if call failed
            assembly {
                revert(add(32, result), mload(result))
            }
        }
    }

    // ========================================
    // Guardian Management
    // ========================================

    /**
     * @dev Add a new guardian
     * @param guardian Address of the guardian to add
     */
    function addGuardian(address guardian) external onlyOwner {
        if (guardian == address(0) || isGuardian[guardian]) {
            revert InvalidGuardian();
        }

        isGuardian[guardian] = true;
        guardians.push(guardian);
        
        emit GuardianAdded(guardian);
    }

    /**
     * @dev Remove a guardian
     * @param guardian Address of the guardian to remove
     */
    function removeGuardian(address guardian) external onlyOwner {
        if (!isGuardian[guardian]) {
            revert InvalidGuardian();
        }

        isGuardian[guardian] = false;
        
        // Remove from array
        for (uint256 i = 0; i < guardians.length; i++) {
            if (guardians[i] == guardian) {
                guardians[i] = guardians[guardians.length - 1];
                guardians.pop();
                break;
            }
        }
        
        emit GuardianRemoved(guardian);
    }

    // ========================================
    // Social Recovery
    // ========================================

    /**
     * @dev Initiate recovery process
     * @param newOwner New owner address
     */
    function initiateRecovery(address newOwner) external onlyGuardian {
        if (newOwner == address(0)) {
            revert InvalidGuardian();
        }

        // Cancel any existing recovery
        _cancelRecovery();

        // Start new recovery
        currentRecovery.newOwner = newOwner;
        currentRecovery.deadline = block.timestamp + 7 days; // 7 days recovery period
        
        emit RecoveryInitiated(newOwner, currentRecovery.deadline);
    }

    /**
     * @dev Approve recovery operation
     * @param signature Guardian's signature
     */
    function approveRecovery(bytes calldata signature) external onlyGuardian {
        if (currentRecovery.newOwner == address(0)) {
            revert RecoveryNotActive();
        }

        if (block.timestamp > currentRecovery.deadline) {
            revert RecoveryExpired();
        }

        if (currentRecovery.hasApproved[msg.sender]) {
            revert InvalidGuardian(); // Already approved
        }

        // Verify signature
        bytes32 hash = keccak256(abi.encodePacked(
            currentRecovery.newOwner,
            currentRecovery.deadline,
            block.chainid
        ));
        
        address signer = hash.toEthSignedMessageHash().recover(signature);
        
        if (signer != msg.sender) {
            revert InvalidSignature();
        }

        currentRecovery.hasApproved[msg.sender] = true;
        currentRecovery.approvalCount++;

        // Check if we have enough approvals
        if (currentRecovery.approvalCount >= requiredGuardians) {
            _completeRecovery();
        }
    }

    /**
     * @dev Cancel current recovery operation
     */
    function cancelRecovery() external onlyOwner {
        _cancelRecovery();
    }

    // ========================================
    // Security Functions
    // ========================================

    /**
     * @dev Update daily transaction limit
     * @param newLimit New daily limit in wei
     */
    function updateDailyLimit(uint256 newLimit) external onlyOwner {
        dailyLimit = newLimit;
    }

    /**
     * @dev Whitelist contract for gas sponsorship
     * @param contractAddress Contract address to whitelist
     */
    function whitelistContract(address contractAddress) external onlyOwner {
        whitelistedContracts[contractAddress] = true;
        emit ContractWhitelisted(contractAddress);
    }

    /**
     * @dev Dewhitelist contract
     * @param contractAddress Contract address to dewhitelist
     */
    function dewhitelistContract(address contractAddress) external onlyOwner {
        whitelistedContracts[contractAddress] = false;
        emit ContractDewhitelisted(contractAddress);
    }

    /**
     * @dev Emergency pause
     */
    function pause() external onlyOwner {
        paused = true;
        emit WalletPaused();
    }

    /**
     * @dev Unpause
     */
    function unpause() external onlyOwner {
        paused = false;
        emit WalletUnpaused();
    }

    // ========================================
    // Internal Functions
    // ========================================

    /**
     * @dev Update daily spent amount
     * @param amount Amount spent
     */
    function _updateDailySpent(uint256 amount) internal {
        // Reset daily spent if new day
        if (block.timestamp >= lastReset + 1 days) {
            dailySpent = 0;
            lastReset = block.timestamp;
        }

        dailySpent += amount;
        emit DailySpentUpdated(dailySpent);
    }

    /**
     * @dev Complete recovery operation
     */
    function _completeRecovery() internal {
        address newOwner = currentRecovery.newOwner;
        _cancelRecovery();
        _transferOwnership(newOwner);
        emit RecoveryCompleted(newOwner);
    }

    /**
     * @dev Cancel recovery operation
     */
    function _cancelRecovery() internal {
        currentRecovery.newOwner = address(0);
        currentRecovery.deadline = 0;
        currentRecovery.approvalCount = 0;
        emit RecoveryCancelled();
    }

    // ========================================
    // Upgrade Functions
    // ========================================

    /**
     * @dev Authorize upgrade
     * @param newImplementation New implementation address
     */
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {
        // Additional upgrade logic can be added here
    }

    // ========================================
    // View Functions
    // ========================================

    /**
     * @dev Get current daily spent
     * @return Amount spent today
     */
    function getDailySpent() external view returns (uint256) {
        return dailySpent;
    }

    /**
     * @dev Get remaining daily limit
     * @return Remaining amount for today
     */
    function getRemainingDailyLimit() external view returns (uint256) {
        if (block.timestamp >= lastReset + 1 days) {
            return dailyLimit;
        }
        return dailyLimit > dailySpent ? dailyLimit - dailySpent : 0;
    }

    /**
     * @dev Get guardian count
     * @return Number of guardians
     */
    function getGuardianCount() external view returns (uint256) {
        return guardians.length;
    }

    /**
     * @dev Check if recovery is active
     * @return True if recovery is active
     */
    function isRecoveryActive() external view returns (bool) {
        return currentRecovery.newOwner != address(0) && 
               block.timestamp <= currentRecovery.deadline;
    }
}

// ========================================
// Structs and Interfaces
// ========================================

/**
 * @dev UserOperation struct for EIP-4337
 */
struct UserOperation {
    address sender;
    uint256 nonce;
    bytes initCode;
    bytes callData;
    uint256 callGasLimit;
    uint256 verificationGasLimit;
    uint256 preVerificationGas;
    uint256 maxFeePerGas;
    uint256 maxPriorityFeePerGas;
    bytes paymasterAndData;
    bytes signature;
}

/**
 * @dev IEntryPoint interface for EIP-4337
 */
interface IEntryPoint {
    function handleOps(UserOperation[] calldata ops, address beneficiary) external;
    function simulateHandleOp(UserOperation calldata op, address target, bytes calldata callData) external;
}
