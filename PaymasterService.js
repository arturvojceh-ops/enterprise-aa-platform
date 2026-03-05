const { ethers } = require('ethers');
const Redis = require('redis');
const winston = require('winston');

/**
 * Enterprise Paymaster Service
 * Handles gas sponsorship for EIP-4337 UserOperations
 */
class PaymasterService {
    constructor(config) {
        this.config = config;
        this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
        this.paymaster = new ethers.Contract(
            config.paymasterAddress,
            PAYMASTER_ABI,
            this.provider
        );
        this.redis = Redis.createClient(config.redis);
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'paymaster.log' })
            ]
        });
    }

    /**
     * Sponsor UserOperation gas
     * @param {Object} userOp - UserOperation object
     * @param {string} userOpHash - Hash of the UserOperation
     * @returns {Object} Sponsorship result
     */
    async sponsorUserOperation(userOp, userOpHash) {
        try {
            // Check if user is whitelisted
            const isWhitelisted = await this.checkUserWhitelist(userOp.sender);
            if (!isWhitelisted) {
                return {
                    success: false,
                    error: 'User not whitelisted for gas sponsorship',
                    code: 'USER_NOT_WHITELISTED'
                };
            }

            // Check daily limits
            const withinLimits = await this.checkDailyLimits(userOp.sender, userOp);
            if (!withinLimits) {
                return {
                    success: false,
                    error: 'Daily gas limit exceeded',
                    code: 'DAILY_LIMIT_EXCEEDED'
                };
            }

            // Calculate sponsorship amount
            const sponsorshipAmount = await this.calculateSponsorshipAmount(userOp);

            // Check paymaster balance
            const hasBalance = await this.checkPaymasterBalance(sponsorshipAmount);
            if (!hasBalance) {
                return {
                    success: false,
                    error: 'Insufficient paymaster balance',
                    code: 'INSUFFICIENT_BALANCE'
                };
            }

            // Generate paymaster data
            const paymasterData = await this.generatePaymasterData(userOp, sponsorshipAmount);

            // Store sponsorship record
            await this.storeSponsorshipRecord(userOpHash, {
                userOp,
                sponsorshipAmount,
                timestamp: Date.now(),
                status: 'pending'
            });

            this.logger.info(`UserOperation sponsored: ${userOpHash}`);

            return {
                success: true,
                data: {
                    paymasterData,
                    sponsorshipAmount,
                    userOpHash
                }
            };

        } catch (error) {
            this.logger.error('Error sponsoring UserOperation:', error);
            return {
                success: false,
                error: error.message,
                code: 'SPONSORSHIP_ERROR'
            };
        }
    }

    /**
     * Check if user is whitelisted for gas sponsorship
     * @param {string} userAddress - User wallet address
     * @returns {boolean} True if whitelisted
     */
    async checkUserWhitelist(userAddress) {
        try {
            // Check Redis cache first
            const cached = await this.redis.get(`whitelist:${userAddress}`);
            if (cached !== null) {
                return cached === 'true';
            }

            // Check smart contract
            const isWhitelisted = await this.paymaster.whitelistedUsers(userAddress);
            
            // Cache result for 5 minutes
            await this.redis.setex(`whitelist:${userAddress}`, 300, isWhitelisted.toString());
            
            return isWhitelisted;

        } catch (error) {
            this.logger.error('Error checking user whitelist:', error);
            return false;
        }
    }

    /**
     * Check daily limits for user
     * @param {string} userAddress - User wallet address
     * @param {Object} userOp - UserOperation object
     * @returns {boolean} True if within limits
     */
    async checkDailyLimits(userAddress, userOp) {
        try {
            // Get user daily limit
            const dailyLimit = await this.paymaster.userDailyLimit(userAddress);
            
            if (dailyLimit.eq(0)) {
                return true; // No limit set
            }

            // Get current daily spent
            const dailySpent = await this.getUserDailySpent(userAddress);
            
            // Estimate gas cost for this operation
            const estimatedGasCost = await this.estimateGasCost(userOp);
            
            return dailySpent.add(estimatedGasCost).lte(dailyLimit);

        } catch (error) {
            this.logger.error('Error checking daily limits:', error);
            return false;
        }
    }

    /**
     * Calculate sponsorship amount
     * @param {Object} userOp - UserOperation object
     * @returns {string} Sponsorship amount in wei
     */
    async calculateSponsorshipAmount(userOp) {
        try {
            // Get sponsorship percentage
            const sponsorshipPercentage = await this.paymaster.sponsorshipPercentage();
            
            // Calculate total gas cost
            const totalGasCost = await this.estimateGasCost(userOp);
            
            // Calculate sponsored amount
            const sponsoredAmount = totalGasCost.mul(sponsorshipPercentage).div(10000);
            
            return sponsoredAmount.toString();

        } catch (error) {
            this.logger.error('Error calculating sponsorship amount:', error);
            return '0';
        }
    }

    /**
     * Estimate gas cost for UserOperation
     * @param {Object} userOp - UserOperation object
     * @returns {Object} Estimated gas cost
     */
    async estimateGasCost(userOp) {
        try {
            const gasPrice = ethers.BigNumber.from(userOp.maxFeePerGas);
            const gasLimit = ethers.BigNumber.from(userOp.callGasLimit)
                .add(ethers.BigNumber.from(userOp.verificationGasLimit))
                .add(ethers.BigNumber.from(userOp.preVerificationGas));
            
            return gasPrice.mul(gasLimit);

        } catch (error) {
            this.logger.error('Error estimating gas cost:', error);
            return ethers.BigNumber.from(0);
        }
    }

    /**
     * Check paymaster balance
     * @param {string} amount - Required amount in wei
     * @returns {boolean} True if sufficient balance
     */
    async checkPaymasterBalance(amount) {
        try {
            const balance = await this.provider.getBalance(this.config.paymasterAddress);
            return balance.gte(ethers.BigNumber.from(amount));

        } catch (error) {
            this.logger.error('Error checking paymaster balance:', error);
            return false;
        }
    }

    /**
     * Generate paymaster data for UserOperation
     * @param {Object} userOp - UserOperation object
     * @param {string} sponsorshipAmount - Amount to sponsor
     * @returns {string} Paymaster data
     */
    async generatePaymasterData(userOp, sponsorshipAmount) {
        try {
            // Create paymaster data
            const paymasterData = ethers.utils.defaultAbiCoder.encode(
                ['address', 'uint256'],
                [this.config.paymasterAddress, sponsorshipAmount]
            );

            // Add paymaster signature (simplified)
            const paymasterAndData = ethers.utils.solidityPack(
                ['address', 'bytes'],
                [this.config.paymasterAddress, paymasterData]
            );

            return paymasterAndData;

        } catch (error) {
            this.logger.error('Error generating paymaster data:', error);
            return '0x';
        }
    }

    /**
     * Get user daily spent amount
     * @param {string} userAddress - User wallet address
     * @returns {Object} Daily spent amount
     */
    async getUserDailySpent(userAddress) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const key = `daily_spent:${userAddress}:${today}`;
            
            const spent = await this.redis.get(key);
            return spent ? ethers.BigNumber.from(spent) : ethers.BigNumber.from(0);

        } catch (error) {
            this.logger.error('Error getting user daily spent:', error);
            return ethers.BigNumber.from(0);
        }
    }

    /**
     * Update user daily spent
     * @param {string} userAddress - User wallet address
     * @param {string} amount - Amount spent
     */
    async updateUserDailySpent(userAddress, amount) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const key = `daily_spent:${userAddress}:${today}`;
            
            const currentSpent = await this.getUserDailySpent(userAddress);
            const newSpent = currentSpent.add(ethers.BigNumber.from(amount));
            
            await this.redis.setex(key, 86400, newSpent.toString()); // 24 hours TTL

        } catch (error) {
            this.logger.error('Error updating user daily spent:', error);
        }
    }

    /**
     * Store sponsorship record
     * @param {string} userOpHash - UserOperation hash
     * @param {Object} record - Sponsorship record
     */
    async storeSponsorshipRecord(userOpHash, record) {
        try {
            await this.redis.setex(
                `sponsorship:${userOpHash}`,
                3600, // 1 hour TTL
                JSON.stringify(record)
            );

        } catch (error) {
            this.logger.error('Error storing sponsorship record:', error);
        }
    }

    /**
     * Get sponsorship status
     * @param {string} userOpHash - UserOperation hash
     * @returns {Object} Sponsorship status
     */
    async getSponsorshipStatus(userOpHash) {
        try {
            const record = await this.redis.get(`sponsorship:${userOpHash}`);
            
            if (!record) {
                return {
                    found: false,
                    error: 'Sponsorship record not found'
                };
            }

            return {
                found: true,
                ...JSON.parse(record)
            };

        } catch (error) {
            this.logger.error('Error getting sponsorship status:', error);
            return {
                found: false,
                error: error.message
            };
        }
    }

    /**
     * Whitelist user for gas sponsorship
     * @param {string} userAddress - User wallet address
     * @param {string} allowance - Gas allowance
     * @param {string} dailyLimit - Daily limit
     * @returns {Object} Result
     */
    async whitelistUser(userAddress, allowance, dailyLimit) {
        try {
            // Call smart contract
            const tx = await this.paymaster.whitelistUser(
                userAddress,
                allowance,
                dailyLimit
            );

            // Wait for confirmation
            const receipt = await tx.wait();

            // Update cache
            await this.redis.setex(`whitelist:${userAddress}`, 300, 'true');

            this.logger.info(`User whitelisted: ${userAddress}`);

            return {
                success: true,
                data: {
                    transactionHash: receipt.transactionHash,
                    blockNumber: receipt.blockNumber
                }
            };

        } catch (error) {
            this.logger.error('Error whitelisting user:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get paymaster statistics
     * @returns {Object} Statistics
     */
    async getStatistics() {
        try {
            const balance = await this.provider.getBalance(this.config.paymasterAddress);
            const sponsorshipPercentage = await this.paymaster.sponsorshipPercentage();
            const globalDailyLimit = await this.paymaster.globalDailyLimit();
            const globalDailySpent = await this.getGlobalDailySpent();

            return {
                balance: balance.toString(),
                sponsorshipPercentage: sponsorshipPercentage.toString(),
                globalDailyLimit: globalDailyLimit.toString(),
                globalDailySpent: globalDailySpent.toString(),
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage()
            };

        } catch (error) {
            this.logger.error('Error getting statistics:', error);
            return {
                error: error.message
            };
        }
    }

    /**
     * Get global daily spent
     * @returns {Object} Global daily spent
     */
    async getGlobalDailySpent() {
        try {
            const today = new Date().toISOString().split('T')[0];
            const key = `global_spent:${today}`;
            
            const spent = await this.redis.get(key);
            return spent ? ethers.BigNumber.from(spent) : ethers.BigNumber.from(0);

        } catch (error) {
            this.logger.error('Error getting global daily spent:', error);
            return ethers.BigNumber.from(0);
        }
    }

    /**
     * Update global daily spent
     * @param {string} amount - Amount spent
     */
    async updateGlobalDailySpent(amount) {
        try {
            const today = new Date().toISOString().split('T')[0];
            const key = `global_spent:${today}`;
            
            const currentSpent = await this.getGlobalDailySpent();
            const newSpent = currentSpent.add(ethers.BigNumber.from(amount));
            
            await this.redis.setex(key, 86400, newSpent.toString()); // 24 hours TTL

        } catch (error) {
            this.logger.error('Error updating global daily spent:', error);
        }
    }

    /**
     * Health check
     * @returns {Object} Health status
     */
    async healthCheck() {
        try {
            // Check Redis connection
            await this.redis.ping();
            
            // Check provider connection
            await this.provider.getNetwork();
            
            // Check Paymaster contract
            const code = await this.provider.getCode(this.config.paymasterAddress);
            
            return {
                status: 'healthy',
                redis: 'connected',
                provider: 'connected',
                paymaster: code !== '0x' ? 'deployed' : 'not_deployed',
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Paymaster ABI (simplified)
const PAYMASTER_ABI = [
    "function validatePaymasterUserOp(tuple(address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,bytes,bytes) userOp, bytes32 userOpHash, uint256 requiredPrefund) returns (bytes memory context, uint256 validationData)",
    "function postOp(bytes calldata context, uint256 actualGasCost, uint256 actualUserOpHash)",
    "function whitelistedUsers(address user) view returns (bool)",
    "function userDailyLimit(address user) view returns (uint256)",
    "function sponsorshipPercentage() view returns (uint256)",
    "function globalDailyLimit() view returns (uint256)",
    "function whitelistUser(address user, uint256 allowance, uint256 dailyLimit)"
];

module.exports = PaymasterService;
