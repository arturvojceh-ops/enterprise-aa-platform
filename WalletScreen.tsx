import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { ethers } from 'ethers';
import Icon from 'react-native-vector-icons/MaterialIcons';
import * as Keychain from 'react-native-keychain';

interface Props {
  walletAddress: string;
  onCreateWallet: () => void;
  provider: ethers.providers.Web3Provider | null;
}

const WalletScreen: React.FC<Props> = ({ 
  walletAddress, 
  onCreateWallet, 
  provider 
}) => {
  const [balance, setBalance] = useState<string>('0');
  const [isLoading, setIsLoading] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (walletAddress && provider) {
      loadWalletData();
    }
  }, [walletAddress, provider]);

  const loadWalletData = async () => {
    if (!provider || !walletAddress) return;

    try {
      setIsLoading(true);
      
      // Get balance
      const balanceWei = await provider.getBalance(walletAddress);
      const balanceEth = ethers.utils.formatEther(balanceWei);
      setBalance(parseFloat(balanceEth).toFixed(4));

      // Get transaction history (simplified)
      const latestBlock = await provider.getBlockNumber();
      const history = await provider.getHistory(walletAddress, latestBlock - 10, latestBlock);
      setTransactions(history.slice(0, 5));

    } catch (error) {
      console.error('Error loading wallet data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const sendTransaction = async () => {
    Alert.alert(
      'Send Transaction',
      'This would open transaction screen with EIP-4337 UserOperation',
      [{ text: 'OK' }]
    );
  };

  const setupRecovery = async () => {
    Alert.alert(
      'Social Recovery',
      'Setup 3-5 guardians for wallet recovery',
      [{ text: 'OK' }]
    );
  };

  const showPaymasterInfo = () => {
    Alert.alert(
      'Paymaster',
      'Gas sponsorship enabled for this wallet. Transactions are sponsored by Enterprise Paymaster.',
      [{ text: 'OK' }]
    );
  };

  if (!walletAddress) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Icon name="account-balance-wallet" size={80} color="#4F46E5" />
          <Text style={styles.emptyTitle}>No Wallet Found</Text>
          <Text style={styles.emptyDescription}>
            Create your Enterprise Account Abstraction Wallet
          </Text>
          <TouchableOpacity style={styles.createButton} onPress={onCreateWallet}>
            <Text style={styles.createButtonText}>Create Wallet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Enterprise AA Wallet</Text>
        <Text style={styles.subtitle}>EIP-4337 Powered</Text>
      </View>

      <View style={styles.balanceCard}>
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <TouchableOpacity onPress={showPaymasterInfo}>
            <Icon name="info" size={20} color="#4F46E5" />
          </TouchableOpacity>
        </View>
        <Text style={styles.balanceAmount}>{balance} ETH</Text>
        <Text style={styles.balanceAddress}>
          {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
        </Text>
      </View>

      <View style={styles.actionGrid}>
        <TouchableOpacity style={styles.actionCard} onPress={sendTransaction}>
          <Icon name="send" size={30} color="#4F46E5" />
          <Text style={styles.actionTitle}>Send</Text>
          <Text style={styles.actionSubtitle}>EIP-4337 Tx</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard} onPress={setupRecovery}>
          <Icon name="security" size={30} color="#4F46E5" />
          <Text style={styles.actionTitle}>Recovery</Text>
          <Text style={styles.actionSubtitle}>Social Backup</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard}>
          <Icon name="history" size={30} color="#4F46E5" />
          <Text style={styles.actionTitle}>History</Text>
          <Text style={styles.actionSubtitle}>Transactions</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionCard}>
          <Icon name="settings" size={30} color="#4F46E5" />
          <Text style={styles.actionTitle}>Settings</Text>
          <Text style={styles.actionSubtitle}>Security</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.featuresSection}>
        <Text style={styles.sectionTitle}>Enterprise Features</Text>
        
        <View style={styles.featureItem}>
          <Icon name="verified-user" size={24} color="#10B981" />
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Biometric Authentication</Text>
            <Text style={styles.featureDescription}>Face ID / Fingerprint enabled</Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Icon name="local-gas-station" size={24} color="#10B981" />
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Paymaster Gas Sponsorship</Text>
            <Text style={features.description}>Gas-free transactions</Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Icon name="group" size={24} color="#10B981" />
          <View style={styles.featureContent}>
            <Text style={styles.featureTitle}>Social Recovery</Text>
            <Text style={styles.featureDescription}>3-5 guardians setup</Text>
          </View>
        </View>
      </View>

      <View style={styles.transactionsSection}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        
        {isLoading ? (
          <ActivityIndicator size="large" color="#4F46E5" />
        ) : (
          transactions.map((tx, index) => (
            <View key={index} style={styles.transactionItem}>
              <Icon 
                name={tx.value.gt(0) ? "arrow-downward" : "arrow-upward"} 
                size={20} 
                color={tx.value.gt(0) ? "#10B981" : "#EF4444"} 
              />
              <View style={styles.transactionContent}>
                <Text style={styles.transactionHash}>
                  {tx.hash.slice(0, 10)}...{tx.hash.slice(-8)}
                </Text>
                <Text style={styles.transactionValue}>
                  {ethers.utils.formatEther(tx.value)} ETH
                </Text>
              </View>
            </View>
          ))
        )}
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
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  balanceAddress: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: 30,
  },
  createButton: {
    backgroundColor: '#4F46E5',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 12,
  },
  createButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#2D2D2D',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 8,
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  featuresSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D2D2D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  featureContent: {
    marginLeft: 16,
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 2,
  },
  featureDescription: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  transactionsSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D2D2D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  transactionContent: {
    marginLeft: 16,
    flex: 1,
  },
  transactionHash: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  transactionValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 2,
  },
});

export default WalletScreen;
