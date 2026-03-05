const { ethers } = require('ethers');
const Redis = require('redis');
const winston = require('winston');
const cron = require('node-cron');

/**
 * Enterprise Bundler Service
 * Handles EIP-4337 UserOperation bundling and execution
 */
class BundlerService {
    constructor(config) {
        this.config = config;
        this.provider = new ethers.providers.JsonRpcProvider(config.rpcUrl);
        this.entryPoint = new ethers.Contract(
            config.entryPointAddress,
            ENTRYPOINT_ABI,
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
                new winston.transports.File({ filename: 'bundler.log' })
            ]
        });
        
        this.userOpPool = new Map();
        this.isProcessing = false;
        
        this.initializeCronJobs();
    }

    /**
     * Initialize cron jobs for periodic processing
     */
    initializeCronJobs() {
        // Process UserOperations every 2 seconds
        cron.schedule('*/2 * * * * *', () => {
            this.processUserOperations();
        });

        // Clean up old operations every 5 minutes
        cron.schedule('*/5 * * * *', () => {
            this.cleanupOldOperations();
        });

        this.logger.info('Bundler cron jobs initialized');
    }

    /**
     * Add UserOperation to pool
     * @param {Object} userOp - UserOperation object
     * @param {string} userOpHash - Hash of the UserOperation
     * @returns {Object} Result with status
     */
    async addUserOperation(userOp, userOpHash) {
        try {
            // Validate UserOperation
            const validation = await this.validateUserOperation(userOp);
            if (!validation.valid) {
                return {
                    success: false,
                    error: validation.error,
                    code: 'INVALID_USER_OP'
                };
            }

            // Check for duplicates
            const exists = await this.redis.exists(`userop:${userOpHash}`);
            if (exists) {
                return {
                    success: false,
                    error: 'UserOperation already exists',
                    code: 'DUPLICATE_USER_OP'
                };
            }

            // Store UserOperation
            const userOpData = {
                ...userOp,
                hash: userOpHash,
                timestamp: Date.now(),
                status: 'pending',
                gasPrice: await this.getOptimalGasPrice(),
                priority: this.calculatePriority(userOp)
            };

            await this.redis.setex(
                `userop:${userOpHash}`,
                300, // 5 minutes TTL
                JSON.stringify(userOpData)
            );

            // Add to processing pool
            this.userOpPool.set(userOpHash, userOpData);

            this.logger.info(`UserOperation added: ${userOpHash}`);

            return {
                success: true,
                data: {
                    hash: userOpHash,
                    status: 'pending',
                    estimatedGas: validation.estimatedGas
                }
            };

        } catch (error) {
            this.logger.error('Error adding UserOperation:', error);
            return {
                success: false,
                error: error.message,
                code: 'INTERNAL_ERROR'
            };
        }
    }

    /**
     * Validate UserOperation
     * @param {Object} userOp - UserOperation object
     * @returns {Object} Validation result
     */
    async validateUserOperation(userOp) {
        try {
            // Basic validation
            if (!userOp.sender || !userOp.nonce === undefined) {
                return { valid: false, error: 'Missing required fields' };
            }

            // Check if sender is a contract
            const code = await this.provider.getCode(userOp.sender);
            if (code === '0x') {
                return { valid: false, error: 'Sender is not a contract' };
            }

            // Simulate UserOperation
            const simulationResult = await this.entryPoint.callStatic.simulateHandleOp(
                [userOp],
                ethers.constants.AddressZero,
                '0x'
            );

            if (simulationResult.success === false) {
                return { 
                    valid: false, 
                    error: simulationResult.error || 'Simulation failed' 
                };
            }

            // Estimate gas
            const estimatedGas = await this.entryPoint.estimateGas.handleOps(
                [userOp],
                ethers.constants.AddressZero
            );

            return {
                valid: true,
                estimatedGas: estimatedGas.toString()
            };

        } catch (error) {
            return { valid: false, error: error.message };
        }
    }

    /**
     * Process UserOperations from pool
     */
    async processUserOperations() {
        if (this.isProcessing) {
            return;
        }

        this.isProcessing = true;

        try {
            // Get UserOperations from Redis
            const keys = await this.redis.keys('userop:*');
            if (keys.length === 0) {
                return;
            }

            // Get UserOperation data
            const userOps = [];
            for (const key of keys) {
                const data = await this.redis.get(key);
                if (data) {
                    userOps.push(JSON.parse(data));
                }
            }

            // Sort by priority and gas price
            userOps.sort((a, b) => {
                if (a.priority !== b.priority) {
                    return b.priority - a.priority;
                }
                return b.gasPrice - a.gasPrice;
            });

            // Bundle UserOperations
            const bundle = this.createBundle(userOps);
            
            if (bundle.userOperations.length > 0) {
                await this.executeBundle(bundle);
            }

        } catch (error) {
            this.logger.error('Error processing UserOperations:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Create bundle from UserOperations
     * @param {Array} userOps - Array of UserOperations
     * @returns {Object} Bundle object
     */
    createBundle(userOps) {
        const maxBundleSize = this.config.maxBundleSize || 10;
        const maxGasLimit = this.config.maxBundleGasLimit || 10000000;

        const bundle = {
            userOperations: [],
            totalGasLimit: 0,
            timestamp: Date.now()
        };

        for (const userOp of userOps) {
            if (bundle.userOperations.length >= maxBundleSize) {
                break;
            }

            const gasLimit = parseInt(userOp.callGasLimit) + 
                           parseInt(userOp.verificationGasLimit) + 
                           parseInt(userOp.preVerificationGas);

            if (bundle.totalGasLimit + gasLimit > maxGasLimit) {
                break;
            }

            bundle.userOperations.push(userOp);
            bundle.totalGasLimit += gasLimit;
        }

        return bundle;
    }

    /**
     * Execute bundle of UserOperations
     * @param {Object} bundle - Bundle object
     */
    async executeBundle(bundle) {
        try {
            // Get optimal gas price
            const gasPrice = await this.getOptimalGasPrice();
            
            // Create transaction data
            const txData = this.entryPoint.interface.encodeFunctionData(
                'handleOps',
                [
                    bundle.userOperations.map(op => ({
                        sender: op.sender,
                        nonce: op.nonce,
                        initCode: op.initCode,
                        callData: op.callData,
                        callGasLimit: op.callGasLimit,
                        verificationGasLimit: op.verificationGasLimit,
                        preVerificationGas: op.preVerificationGas,
                        maxFeePerGas: op.maxFeePerGas,
                        maxPriorityFeePerGas: op.maxPriorityFeePerGas,
                        paymasterAndData: op.paymasterAndData,
                        signature: op.signature
                    })),
                    this.config.beneficiary || ethers.constants.AddressZero
                ]
            );

            // Estimate gas for bundle
            const gasLimit = await this.provider.estimateGas({
                to: this.config.entryPointAddress,
                data: txData,
                gasPrice: gasPrice
            });

            // Execute transaction
            const tx = await this.provider.getSigner().sendTransaction({
                to: this.config.entryPointAddress,
                data: txData,
                gasLimit: gasLimit,
                gasPrice: gasPrice
            });

            // Wait for confirmation
            const receipt = await tx.wait();

            // Update UserOperation statuses
            for (const userOp of bundle.userOperations) {
                await this.redis.setex(
                    `userop:${userOp.hash}`,
                    3600, // 1 hour TTL
                    JSON.stringify({
                        ...userOp,
                        status: 'executed',
                        transactionHash: receipt.transactionHash,
                        blockNumber: receipt.blockNumber,
                        executedAt: Date.now()
                    })
                );

                // Remove from pool
                this.userOpPool.delete(userOp.hash);
            }

            this.logger.info(`Bundle executed: ${receipt.transactionHash}`);

        } catch (error) {
            this.logger.error('Error executing bundle:', error);
            
            // Mark failed UserOperations
            for (const userOp of bundle.userOperations) {
                await this.redis.setex(
                    `userop:${userOp.hash}`,
                    300, // 5 minutes TTL
                    JSON.stringify({
                        ...userOp,
                        status: 'failed',
                        error: error.message,
                        failedAt: Date.now()
                    })
                );
            }
        }
    }

    /**
     * Get optimal gas price
     * @returns {number} Optimal gas price
     */
    async getOptimalGasPrice() {
        try {
            const feeData = await this.provider.getFeeData();
            return feeData.maxFeePerGas || feeData.gasPrice;
        } catch (error) {
            // Fallback to fixed gas price
            return ethers.utils.parseUnits('20', 'gwei');
        }
    }

    /**
     * Calculate priority for UserOperation
     * @param {Object} userOp - UserOperation object
     * @returns {number} Priority score
     */
    calculatePriority(userOp) {
        let priority = 0;

        // Higher priority for higher gas price
        const gasPrice = parseInt(userOp.maxFeePerGas);
        priority += Math.floor(gasPrice / 1e9) * 10;

        // Higher priority for smaller gas limit (faster execution)
        const gasLimit = parseInt(userOp.callGasLimit);
        priority += Math.floor(1000000 / gasLimit);

        // Bonus for whitelisted senders
        if (this.config.whitelistedSenders?.includes(userOp.sender)) {
            priority += 1000;
        }

        return priority;
    }

    /**
     * Get UserOperation status
     * @param {string} userOpHash - Hash of the UserOperation
     * @returns {Object} Status information
     */
    async getUserOperationStatus(userOpHash) {
        try {
            const data = await this.redis.get(`userop:${userOpHash}`);
            if (!data) {
                return {
                    found: false,
                    error: 'UserOperation not found'
                };
            }

            const userOp = JSON.parse(data);
            return {
                found: true,
                status: userOp.status,
                timestamp: userOp.timestamp,
                transactionHash: userOp.transactionHash,
                blockNumber: userOp.blockNumber,
                error: userOp.error
            };

        } catch (error) {
            return {
                found: false,
                error: error.message
            };
        }
    }

    /**
     * Clean up old operations
     */
    async cleanupOldOperations() {
        try {
            const keys = await this.redis.keys('userop:*');
            const now = Date.now();
            const maxAge = 30 * 60 * 1000; // 30 minutes

            for (const key of keys) {
                const data = await this.redis.get(key);
                if (data) {
                    const userOp = JSON.parse(data);
                    if (now - userOp.timestamp > maxAge) {
                        await this.redis.del(key);
                        this.userOpPool.delete(userOp.hash);
                    }
                }
            }

            this.logger.info('Old UserOperations cleaned up');

        } catch (error) {
            this.logger.error('Error cleaning up old operations:', error);
        }
    }

    /**
     * Get bundler statistics
     * @returns {Object} Statistics
     */
    async getStatistics() {
        try {
            const pendingCount = await this.redis.keys('userop:*').then(keys => keys.length);
            const poolSize = this.userOpPool.size;
            
            return {
                pendingOperations: pendingCount,
                poolSize: poolSize,
                isProcessing: this.isProcessing,
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
     * Health check
     * @returns {Object} Health status
     */
    async healthCheck() {
        try {
            // Check Redis connection
            await this.redis.ping();
            
            // Check provider connection
            await this.provider.getNetwork();
            
            // Check EntryPoint contract
            const code = await this.provider.getCode(this.config.entryPointAddress);
            
            return {
                status: 'healthy',
                redis: 'connected',
                provider: 'connected',
                entryPoint: code !== '0x' ? 'deployed' : 'not_deployed',
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

// EIP-4337 EntryPoint ABI (simplified)
const ENTRYPOINT_ABI = [
    "function handleOps((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,bytes,bytes)[] ops, address beneficiary)",
    "function simulateHandleOp((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,bytes,bytes) op, address target, bytes calldata)",
    "function getNonce(address sender, uint192 key)"
];

module.exports = BundlerService;
