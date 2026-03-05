import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { StatusBar, StyleSheet } from 'react-native';
import { ethers } from 'ethers';
import * as Keychain from 'react-native-keychain';
import Biometrics from 'react-native-biometrics';

// Screens
import WalletScreen from './src/screens/WalletScreen';
import TransactionScreen from './src/screens/TransactionScreen';
import RecoveryScreen from './src/screens/RecoveryScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createStackNavigator();

// EIP-4337 EntryPoint ABI (simplified)
const ENTRYPOINT_ABI = [
  "function simulateHandleOp((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,bytes,bytes)[] op, address target, bytes calldata)",
  "function handleOps((address,uint256,bytes,bytes,uint256,uint256,uint256,uint256,bytes,bytes)[] ops, address beneficiary)"
];

// EntryPoint Contract Address (Ethereum Mainnet)
const ENTRYPOINT_ADDRESS = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";

const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [provider, setProvider] = useState<ethers.providers.Web3Provider | null>(null);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Initialize Web3 Provider
      const web3Provider = new ethers.providers.JsonRpcProvider('https://eth-mainnet.alchemyapi.io/v2/demo');
      setProvider(web3Provider);

      // Check biometric authentication
      const { available, biometryType } = await Biometrics.isSensorAvailable();
      
      if (available) {
        const { success } = await Biometrics.simplePrompt({
          prompt: 'Authenticate to access Enterprise AA Wallet',
          cancelButtonText: 'Cancel',
        });
        
        if (success) {
          setIsAuthenticated(true);
          await loadWallet();
        }
      }
    } catch (error) {
      console.error('App initialization error:', error);
    }
  };

  const loadWallet = async () => {
    try {
      // Retrieve wallet from secure storage
      const credentials = await Keychain.getGenericPassword();
      if (credentials) {
        const wallet = new ethers.Wallet(credentials.password);
        setWalletAddress(wallet.address);
      }
    } catch (error) {
      console.error('Wallet loading error:', error);
    }
  };

  const createWallet = async () => {
    try {
      // Create new wallet
      const wallet = ethers.Wallet.createRandom();
      
      // Store private key securely
      await Keychain.setGenericPassword('enterprise_aa_wallet', wallet.privateKey);
      
      setWalletAddress(wallet.address);
      
      // Deploy smart contract wallet (simplified)
      await deploySmartContractWallet(wallet.address);
      
    } catch (error) {
      console.error('Wallet creation error:', error);
    }
  };

  const deploySmartContractWallet = async (owner: string) => {
    try {
      if (!provider) return;

      // Simple Smart Contract Wallet bytecode (simplified for demo)
      const walletBytecode = '0x608060405234801561001057600080fd5b50600436106100365760003560e01c8063' + 
                            '8da5cb5b1461003b578063a9059cbb14610059575b600080fd5b' +
                            '61004361004e565b60405161005091906100a7565b60405180910390f35b' +
                            '610063600480360381019061005e91906100d3565b60405161006b91906100a7565b60405180910390f35b600080fd5b6000819050919050565b61008881610075565b82525050565b60006020820190506100a3600083018461007f565b92915050565b60006020820190506100be600083018461007f565b92915050565b600080fd5b6100d281610075565b81146100dd57600080fd5b50565b6000602082840312156100f5576100fe565b6000602082840312156100f557600080fd5b6000610101848285016100c8565b9150509291505056';

      const factory = new ethers.ContractFactory(ENTRYPOINT_ABI, walletBytecode, wallet);
      const contract = await factory.deploy(owner);
      
      console.log('Smart Contract Wallet deployed at:', contract.address);
      
    } catch (error) {
      console.error('Smart contract deployment error:', error);
    }
  };

  if (!isAuthenticated) {
    return null; // Show loading screen
  }

  return (
    <NavigationContainer>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#1a1a1a' },
          headerTintColor: '#ffffff',
          headerTitleStyle: { fontWeight: 'bold' },
        }}
      >
        <Stack.Screen 
          name="Wallet" 
          component={WalletScreen}
          initialParams={{ 
            walletAddress, 
            onCreateWallet: createWallet,
            provider 
          }}
        />
        <Stack.Screen 
          name="Transaction" 
          component={TransactionScreen}
          initialParams={{ walletAddress, provider }}
        />
        <Stack.Screen 
          name="Recovery" 
          component={RecoveryScreen}
          initialParams={{ walletAddress }}
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen}
          initialParams={{ walletAddress }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
});

export default App;
