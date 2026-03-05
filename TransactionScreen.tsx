import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { ethers } from 'ethers';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface Props {
  walletAddress: string;
  provider: ethers.providers.Web3Provider | null;
}

const TransactionScreen: React.FC<Props> = ({ walletAddress, provider }) => {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [balance, setBalance] = useState('0');
  const [gasPrice, setGasPrice] = useState('0');
  const [usePaymaster, setUsePaymaster] = useState(true);

  useEffect(() => {
    loadWalletData();
  }, [walletAddress, provider]);

  const loadWalletData = async () => {
    if (!provider || !walletAddress) return;

    try {
      const [balanceWei, feeData] = await Promise.all([
        provider.getBalance(walletAddress),
        provider.getFeeData()
      ]);

      setBalance(ethers.utils.formatEther(balanceWei));
      setGasPrice(ethers.utils.formatUnits(feeData.gasPrice || 0, 'gwei'));
    } catch (error) {
      console.error('Error loading wallet data:', error);
    }
  };

  const sendTransaction = async () => {
    if (!recipient || !amount) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    if (!ethers.utils.isAddress(recipient)) {
      Alert.alert('Error', 'Invalid recipient address');
      return;
    }

    setIsProcessing(true);

    try {
      // Create EIP-4337 UserOperation
      const userOp = await createUserOperation();
      
      // Send to bundler
      const response = await fetch('http://localhost:3000/api/bundler/userop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sender: walletAddress,
          nonce: await getNonce(),
          initCode: '0x',
          callData: createCallData(recipient, amount),
          callGasLimit: '100000',
          verificationGasLimit: '50000',
          preVerificationGas: '21000',
          maxFeePerGas: ethers.utils.parseUnits(gasPrice, 'gwei'),
          maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei'),
          paymasterAndData: usePaymaster ? await getPaymasterData() : '0x',
          signature: '0x' // Will be signed by wallet
        })
      });

      const result = await response.json();

      if (result.success) {
        Alert.alert(
          'Transaction Sent',
          `Hash: ${result.data.hash}\nStatus: ${result.data.status}`,
          [{ text: 'OK' }]
        );
        setRecipient('');
        setAmount('');
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const createUserOperation = async () => {
    // Simplified UserOperation creation
    return {
      sender: walletAddress,
      nonce: await getNonce(),
      initCode: '0x',
      callData: createCallData(recipient, amount),
      callGasLimit: '100000',
      verificationGasLimit: '50000',
      preVerificationGas: '21000',
      maxFeePerGas: ethers.utils.parseUnits(gasPrice, 'gwei'),
      maxPriorityFeePerGas: ethers.utils.parseUnits('2', 'gwei'),
      paymasterAndData: usePaymaster ? await getPaymasterData() : '0x',
      signature: '0x'
    };
  };

  const getNonce = async () => {
    // Get nonce from EntryPoint contract
    return 1; // Simplified
  };

  const createCallData = (to: string, value: string) => {
    // Create call data for ETH transfer
    const iface = new ethers.utils.Interface(['function transfer(address to, uint256 amount)']);
    return iface.encodeFunctionData('transfer', [
      to,
      ethers.utils.parseEther(value)
    ]);
  };

  const getPaymasterData = async () => {
    // Get paymaster data for gas sponsorship
    return '0x1234567890abcdef'; // Simplified
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Send Transaction</Text>
        <Text style={styles.subtitle}>EIP-4337 UserOperation</Text>
      </View>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>{balance} ETH</Text>
        <Text style={styles.gasPrice}>Gas Price: {gasPrice} Gwei</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Recipient Address</Text>
          <TextInput
            style={styles.input}
            value={recipient}
            onChangeText={setRecipient}
            placeholder="0x..."
            placeholderTextColor="#6B7280"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Amount (ETH)</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.0"
            placeholderTextColor="#6B7280"
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.paymasterToggle}>
          <TouchableOpacity
            style={[styles.toggle, usePaymaster && styles.toggleActive]}
            onPress={() => setUsePaymaster(!usePaymaster)}
          >
            <Icon
              name={usePaymaster ? "check-box" : "check-box-outline-blank"}
              size={24}
              color={usePaymaster ? "#4F46E5" : "#6B7280"}
            />
          </TouchableOpacity>
          <Text style={styles.toggleLabel}>
            Use Paymaster (Gas Sponsorship)
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.sendButton, isProcessing && styles.sendButtonDisabled]}
          onPress={sendTransaction}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Icon name="send" size={20} color="#ffffff" />
              <Text style={styles.sendButtonText}>Send Transaction</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Transaction Details</Text>
        
        <View style={styles.infoItem}>
          <Icon name="account-balance-wallet" size={20} color="#4F46E5" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>From</Text>
            <Text style={styles.infoValue}>
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </Text>
          </View>
        </View>

        <View style={styles.infoItem}>
          <Icon name="arrow-forward" size={20} color="#4F46E5" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>To</Text>
            <Text style={styles.infoValue}>
              {recipient ? `${recipient.slice(0, 6)}...${recipient.slice(-4)}` : 'Not set'}
            </Text>
          </View>
        </View>

        <View style={styles.infoItem}>
          <Icon name="local-gas-station" size={20} color="#4F46E5" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Gas Sponsorship</Text>
            <Text style={styles.infoValue}>
              {usePaymaster ? 'Enabled' : 'Disabled'}
            </Text>
          </View>
        </View>

        <View style={styles.infoItem}>
          <Icon name="security" size={20} color="#4F46E5" />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Security</Text>
            <Text style={styles.infoValue}>
              EIP-4337 UserOperation
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  balanceCard: {
    margin: 20,
    padding: 20,
    backgroundColor: '#2D2D2D',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4F46E5',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  gasPrice: {
    fontSize: 12,
    color: '#6B7280',
  },
  form: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#2D2D2D',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#374151',
  },
  paymasterToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  toggle: {
    marginRight: 12,
  },
  toggleActive: {
    backgroundColor: '#4F46E5',
    borderRadius: 4,
    padding: 2,
  },
  toggleLabel: {
    fontSize: 14,
    color: '#ffffff',
    flex: 1,
  },
  sendButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#374151',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D2D2D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  infoContent: {
    marginLeft: 16,
    flex: 1,
  },
  infoTitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
});

export default TransactionScreen;
