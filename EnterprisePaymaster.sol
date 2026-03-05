// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Enterprise Paymaster
 * @dev EIP-4337 compatible paymaster for gas sponsorship
 * @notice Handles gas sponsorship for enterprise users with advanced controls
 */
contract EnterprisePaymaster is 
    Initializable, 
    UUPSUpgradeable, 
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable 
{
    using SafeERC20 for IERC20;

    // ========================================
    // State Variables
    // ========================================

    /// @dev EntryPoint contract address
    address public immutable entryPoint;

    /// @dev Native token (ETH) address (zero address for ETH)
    address public constant NATIVE_TOKEN = address(0);

    /// @dev ERC20 token for gas sponsorship
    IERC20 public gasToken;

    /// @dev Gas price oracle
    address public gasPriceOracle;

    /// @dev User gas limits and allowances
    mapping(address => uint256) public userGasAllowance;
    mapping(address => uint256) public userDailyLimit;
    mapping(address => uint256) public userDailySpent;
    mapping(address => uint256) public userLastReset;

    /// @dev Global daily limit for paymaster
    uint256 public globalDailyLimit;
    uint256 public globalDailySpent;
    uint256 public globalLastReset;

    /// @dev Whitelisted users
    mapping(address => bool) public whitelistedUsers;
    mapping(address => bool) public whitelistedContracts;

    /// @dev Gas sponsorship configuration
    uint256 public maxGasPrice;
    uint256 public sponsorshipPercentage; // 0-10000 (0-100%)
    uint256 public minSponsorshipAmount;

    /// @dev Emergency pause
    bool public paused;

    // ========================================
    // Events
    // ========================================

    event GasSponsored(address indexed user, uint256 gasCost, uint256 sponsoredAmount);
    event UserWhitelisted(address indexed user);
    event UserDewhitelisted(address indexed user);
    event ContractWhitelisted(address indexed contract);
    event ContractDewhitelisted(address indexed contract);
    event GasAllowanceUpdated(address indexed user, uint256 allowance);
    event DailyLimitUpdated(address indexed user, uint256 limit);
    event GlobalDailyLimitUpdated(uint256 limit);
    event PaymasterPaused();
    event PaymasterUnpaused();

    // ========================================
    // Errors
    // ========================================

    error InvalidEntryPoint();
    error UserNotWhitelisted();
    error InsufficientAllowance();
    error DailyLimitExceeded();
    error GlobalLimitExceeded();
    error GasPriceTooHigh();
    error InvalidToken();
    error ContractPaused();
    error InsufficientBalance();
    error InvalidSponsorship();

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

    modifier onlyWhitelistedUser(address user) {
        if (!whitelistedUsers[user]) revert UserNotWhitelisted();
        _;
    }

    // ========================================
    // Constructor
    // ========================================

    constructor(address _entryPoint) {
        if (_entryPoint == address(0)) revert InvalidEntryPoint();
        entryPoint = _entryPoint;
    }

    // ========================================
    // Initialization
    // ========================================

    /**
     * @dev Initialize the paymaster
     * @param _gasToken Token used for gas sponsorship (zero address for ETH)
     * @param _gasPriceOracle Oracle for gas price
     * @param _maxGasPrice Maximum gas price allowed
     * @param _sponsorshipPercentage Percentage of gas to sponsor (0-10000)
     * @param _globalDailyLimit Global daily limit
     */
    function initialize(
        address _gasToken,
        address _gasPriceOracle,
        uint256 _maxGasPrice,
        uint256 _sponsorshipPercentage,
        uint256 _globalDailyLimit
    ) external initializer {
        __Ownable_init();
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        gasToken = _gasToken != address(0) ? IERC20(_gasToken) : IERC20(NATIVE_TOKEN);
        gasPriceOracle = _gasPriceOracle;
        maxGasPrice = _maxGasPrice;
        sponsorshipPercentage = _sponsorshipPercentage;
        globalDailyLimit = _globalDailyLimit;
        globalLastReset = block.timestamp;
        paused = false;
    }

    // ========================================
    // EIP-4337 Paymaster Functions
    // ========================================

    /**
     * @dev Validate and sponsor UserOperation
     * @param userOp UserOperation data
     * @param requiredPrefund Required prefund amount
     * @return context Context for postOp
     * @return validationData Packed validation data
     */
    function validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 requiredPrefund
    ) external view onlyEntryPoint whenNotPaused returns (bytes memory context, uint256 validationData) {
        address user = userOp.sender;

        // Check if user is whitelisted
        if (!whitelistedUsers[user]) {
            return ("", 1); // Failed validation
        }

        // Check gas price
        uint256 gasPrice = userOp.maxFeePerGas;
        if (gasPrice > maxGasPrice) {
            return ("", 1); // Failed validation
        }

        // Check daily limits
        if (!_checkDailyLimits(user, requiredPrefund)) {
            return ("", 1); // Failed validation
        }

        // Calculate sponsorship amount
        uint256 sponsorAmount = (requiredPrefund * sponsorshipPercentage) / 10000;
        
        // Check if we have enough balance
        if (address(gasToken) == NATIVE_TOKEN) {
            if (address(this).balance < sponsorAmount) {
                return ("", 1); // Failed validation
            }
        } else {
            if (gasToken.balanceOf(address(this)) < sponsorAmount) {
                return ("", 1); // Failed validation
            }
        }

        // Create context
        context = abi.encode(user, requiredPrefund, sponsorAmount);
        validationData = 0; // Success
    }

    /**
     * @dev Post-operation handling for paymaster
     * @param context Context from validatePaymasterUserOp
     * @param actualGasCost Actual gas cost
     * @param actualUserOpHash Hash of the UserOperation
     */
    function postOp(
        bytes calldata context,
        uint256 actualGasCost,
        uint256 /*actualUserOpHash*/
    ) external onlyEntryPoint whenNotPaused nonReentrant {
        (address user, uint256 requiredPrefund, uint256 sponsorAmount) = abi.decode(context, (address, uint256, uint256));

        // Update daily spent
        _updateDailySpent(user, actualGasCost);

        // Sponsor gas
        if (sponsorAmount > 0) {
            _sponsorGas(user, sponsorAmount);
            emit GasSponsored(user, actualGasCost, sponsorAmount);
        }
    }

    // ========================================
    // User Management
    // ========================================

    /**
     * @dev Whitelist a user for gas sponsorship
     * @param user User address to whitelist
     * @param allowance Gas allowance for the user
     * @param dailyLimit Daily limit for the user
     */
    function whitelistUser(
        address user,
        uint256 allowance,
        uint256 dailyLimit
    ) external onlyOwner {
        if (user == address(0)) revert UserNotWhitelisted();

        whitelistedUsers[user] = true;
        userGasAllowance[user] = allowance;
        userDailyLimit[user] = dailyLimit;
        userLastReset[user] = block.timestamp;

        emit UserWhitelisted(user);
        emit GasAllowanceUpdated(user, allowance);
        emit DailyLimitUpdated(user, dailyLimit);
    }

    /**
     * @dev Dewhitelist a user
     * @param user User address to dewhitelist
     */
    function dewhitelistUser(address user) external onlyOwner {
        whitelistedUsers[user] = false;
        emit UserDewhitelisted(user);
    }

    /**
     * @dev Update user gas allowance
     * @param user User address
     * @param allowance New allowance
     */
    function updateUserGasAllowance(address user, uint256 allowance) external onlyOwner {
        userGasAllowance[user] = allowance;
        emit GasAllowanceUpdated(user, allowance);
    }

    /**
     * @dev Update user daily limit
     * @param user User address
     * @param limit New daily limit
     */
    function updateUserDailyLimit(address user, uint256 limit) external onlyOwner {
        userDailyLimit[user] = limit;
        emit DailyLimitUpdated(user, limit);
    }

    // ========================================
    // Contract Management
    // ========================================

    /**
     * @dev Whitelist a contract for gas sponsorship
     * @param contractAddress Contract address to whitelist
     */
    function whitelistContract(address contractAddress) external onlyOwner {
        whitelistedContracts[contractAddress] = true;
        emit ContractWhitelisted(contractAddress);
    }

    /**
     * @dev Dewhitelist a contract
     * @param contractAddress Contract address to dewhitelist
     */
    function dewhitelistContract(address contractAddress) external onlyOwner {
        whitelistedContracts[contractAddress] = false;
        emit ContractDewhitelisted(contractAddress);
    }

    // ========================================
    // Configuration
    // ========================================

    /**
     * @dev Update sponsorship percentage
     * @param newPercentage New percentage (0-10000)
     */
    function updateSponsorshipPercentage(uint256 newPercentage) external onlyOwner {
        if (newPercentage > 10000) revert InvalidSponsorship();
        sponsorshipPercentage = newPercentage;
    }

    /**
     * @dev Update maximum gas price
     * @param newMaxGasPrice New maximum gas price
     */
    function updateMaxGasPrice(uint256 newMaxGasPrice) external onlyOwner {
        maxGasPrice = newMaxGasPrice;
    }

    /**
     * @dev Update global daily limit
     * @param newLimit New global daily limit
     */
    function updateGlobalDailyLimit(uint256 newLimit) external onlyOwner {
        globalDailyLimit = newLimit;
        emit GlobalDailyLimitUpdated(newLimit);
    }

    /**
     * @dev Update gas token
     * @param newGasToken New gas token address
     */
    function updateGasToken(address newGasToken) external onlyOwner {
        gasToken = newGasToken != address(0) ? IERC20(newGasToken) : IERC20(NATIVE_TOKEN);
    }

    /**
     * @dev Pause paymaster
     */
    function pause() external onlyOwner {
        paused = true;
        emit PaymasterPaused();
    }

    /**
     * @dev Unpause paymaster
     */
    function unpause() external onlyOwner {
        paused = false;
        emit PaymasterUnpaused();
    }

    // ========================================
    // Funding Functions
    // ========================================

    /**
     * @dev Fund paymaster with ETH
     */
    receive() external payable {
        // Accept ETH for gas sponsorship
    }

    /**
     * @dev Fund paymaster with ERC20 tokens
     * @param token Token address
     * @param amount Amount to fund
     */
    function fundWithToken(address token, uint256 amount) external {
        if (token == address(0)) revert InvalidToken();
        
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /**
     * @dev Withdraw excess funds
     * @param token Token address (zero address for ETH)
     * @param amount Amount to withdraw
     * @param to Recipient address
     */
    function withdraw(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        if (token == address(0)) {
            // Withdraw ETH
            if (address(this).balance < amount) revert InsufficientBalance();
            payable(to).transfer(amount);
        } else {
            // Withdraw ERC20
            IERC20 tokenContract = IERC20(token);
            if (tokenContract.balanceOf(address(this)) < amount) revert InsufficientBalance();
            tokenContract.safeTransfer(to, amount);
        }
    }

    // ========================================
    // Internal Functions
    // ========================================

    /**
     * @dev Check daily limits
     * @param user User address
     * @param amount Amount to check
     * @return True if within limits
     */
    function _checkDailyLimits(address user, uint256 amount) internal view returns (bool) {
        // Check user daily limit
        uint256 userLimit = userDailyLimit[user];
        uint256 userSpent = userDailySpent[user];
        
        // Reset if new day
        if (block.timestamp >= userLastReset[user] + 1 days) {
            userSpent = 0;
        }
        
        if (userLimit > 0 && userSpent + amount > userLimit) {
            return false;
        }

        // Check global daily limit
        uint256 globalSpent = globalDailySpent;
        
        // Reset if new day
        if (block.timestamp >= globalLastReset + 1 days) {
            globalSpent = 0;
        }
        
        if (globalDailyLimit > 0 && globalSpent + amount > globalDailyLimit) {
            return false;
        }

        return true;
    }

    /**
     * @dev Update daily spent amounts
     * @param user User address
     * @param amount Amount spent
     */
    function _updateDailySpent(address user, uint256 amount) internal {
        // Update user daily spent
        if (block.timestamp >= userLastReset[user] + 1 days) {
            userDailySpent[user] = amount;
            userLastReset[user] = block.timestamp;
        } else {
            userDailySpent[user] += amount;
        }

        // Update global daily spent
        if (block.timestamp >= globalLastReset + 1 days) {
            globalDailySpent = amount;
            globalLastReset = block.timestamp;
        } else {
            globalDailySpent += amount;
        }
    }

    /**
     * @dev Sponsor gas for user
     * @param user User address
     * @param amount Amount to sponsor
     */
    function _sponsorGas(address user, uint256 amount) internal {
        if (address(gasToken) == NATIVE_TOKEN) {
            // Sponsor with ETH
            payable(user).transfer(amount);
        } else {
            // Sponsor with ERC20
            gasToken.safeTransfer(user, amount);
        }
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
     * @dev Get user remaining daily limit
     * @param user User address
     * @return Remaining daily limit
     */
    function getUserRemainingDailyLimit(address user) external view returns (uint256) {
        uint256 limit = userDailyLimit[user];
        uint256 spent = userDailySpent[user];
        
        // Reset if new day
        if (block.timestamp >= userLastReset[user] + 1 days) {
            return limit;
        }
        
        return limit > spent ? limit - spent : 0;
    }

    /**
     * @dev Get global remaining daily limit
     * @return Remaining global daily limit
     */
    function getGlobalRemainingDailyLimit() external view returns (uint256) {
        uint256 spent = globalDailySpent;
        
        // Reset if new day
        if (block.timestamp >= globalLastReset + 1 days) {
            return globalDailyLimit;
        }
        
        return globalDailyLimit > spent ? globalDailyLimit - spent : 0;
    }

    /**
     * @dev Get paymaster balance
     * @return ETH balance
     */
    function getEthBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @dev Get token balance
     * @param token Token address
     * @return Token balance
     */
    function getTokenBalance(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
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
