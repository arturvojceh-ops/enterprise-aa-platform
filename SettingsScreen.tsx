import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface Props {
  walletAddress: string;
}

const SettingsScreen: React.FC<Props> = ({ walletAddress }) => {
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoLockEnabled, setAutoLockEnabled] = useState(true);
  const [autoLockTime, setAutoLockTime] = useState(5);
  const [darkMode, setDarkMode] = useState(true);
  const [securityLevel, setSecurityLevel] = useState<'high' | 'medium' | 'low'>('high');

  const handleBiometricToggle = () => {
    setBiometricEnabled(!biometricEnabled);
    Alert.alert(
      'Biometric Authentication',
      biometricEnabled ? 'Biometric auth disabled' : 'Biometric auth enabled'
    );
  };

  const handleNotificationsToggle = () => {
    setNotificationsEnabled(!notificationsEnabled);
  };

  const handleAutoLockToggle = () => {
    setAutoLockEnabled(!autoLockEnabled);
  };

  const handleSecurityLevelChange = (level: 'high' | 'medium' | 'low') => {
    setSecurityLevel(level);
    Alert.alert(
      'Security Level',
      `Security level changed to ${level.toUpperCase()}`
    );
  };

  const exportPrivateKey = () => {
    Alert.alert(
      'Export Private Key',
      'This will show your private key. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Show',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Private Key',
              '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
              [{ text: 'Copy', onPress: () => console.log('Key copied') }]
            );
          },
        },
      ]
    );
  };

  const resetWallet = () => {
    Alert.alert(
      'Reset Wallet',
      'This will permanently delete your wallet. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Wallet Reset', 'Wallet has been reset successfully');
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Security & Preferences</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Icon name="fingerprint" size={24} color="#4F46E5" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Biometric Authentication</Text>
              <Text style={styles.settingDescription}>
                Use Face ID or fingerprint to unlock
              </Text>
            </View>
          </View>
          <Switch
            value={biometricEnabled}
            onValueChange={handleBiometricToggle}
            trackColor={{ false: '#374151', true: '#4F46E5' }}
            thumbColor={biometricEnabled ? '#ffffff' : '#9CA3AF'}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Icon name="lock" size={24} color="#4F46E5" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Auto-Lock</Text>
              <Text style={styles.settingDescription}>
                Automatically lock wallet after {autoLockTime} minutes
              </Text>
            </View>
          </View>
          <Switch
            value={autoLockEnabled}
            onValueChange={handleAutoLockToggle}
            trackColor={{ false: '#374151', true: '#4F46E5' }}
            thumbColor={autoLockEnabled ? '#ffffff' : '#9CA3AF'}
          />
        </View>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Icon name="security" size={24} color="#4F46E5" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Security Level</Text>
              <Text style={styles.settingDescription}>
                Current: {securityLevel.toUpperCase()}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.securityLevels}>
          {(['high', 'medium', 'low'] as const).map((level) => (
            <TouchableOpacity
              key={level}
              style={[
                styles.securityLevelButton,
                securityLevel === level && styles.securityLevelButtonActive,
              ]}
              onPress={() => handleSecurityLevelChange(level)}
            >
              <Text
                style={[
                  styles.securityLevelText,
                  securityLevel === level && styles.securityLevelTextActive,
                ]}
              >
                {level.toUpperCase()}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Icon name="notifications" size={24} color="#4F46E5" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Push Notifications</Text>
              <Text style={styles.settingDescription}>
                Receive transaction alerts and updates
              </Text>
            </View>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationsToggle}
            trackColor={{ false: '#374151', true: '#4F46E5' }}
            thumbColor={notificationsEnabled ? '#ffffff' : '#9CA3AF'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        
        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Icon name="dark-mode" size={24} color="#4F46E5" />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Dark Mode</Text>
              <Text style={styles.settingDescription}>
                Use dark theme
              </Text>
            </View>
          </View>
          <Switch
            value={darkMode}
            onValueChange={setDarkMode}
            trackColor={{ false: '#374151', true: '#4F46E5' }}
            thumbColor={darkMode ? '#ffffff' : '#9CA3AF'}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wallet Information</Text>
        
        <View style={styles.infoItem}>
          <Icon name="account-balance-wallet" size={20} color="#4F46E5" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>Wallet Address</Text>
            <Text style={styles.infoValue}>
              {walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}
            </Text>
          </View>
        </View>

        <View style={styles.infoItem}>
          <Icon name="smartphone" size={20} color="#4F46E5" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>App Version</Text>
            <Text style={styles.infoValue}>1.0.0</Text>
          </View>
        </View>

        <View style={styles.infoItem}>
          <Icon name="code" size={20} color="#4F46E5" />
          <View style={styles.infoContent}>
            <Text style={styles.infoLabel}>EIP-4337</Text>
            <Text style={styles.infoValue}>Enabled</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Advanced</Text>
        
        <TouchableOpacity style={styles.advancedButton} onPress={exportPrivateKey}>
          <Icon name="key" size={20} color="#EF4444" />
          <Text style={styles.advancedButtonText}>Export Private Key</Text>
          <Icon name="chevron-right" size={20} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.advancedButton} onPress={resetWallet}>
          <Icon name="delete" size={20} color="#EF4444" />
          <Text style={styles.advancedButtonText}>Reset Wallet</Text>
          <Icon name="chevron-right" size={20} color="#6B7280" />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Support</Text>
        
        <TouchableOpacity style={styles.supportButton}>
          <Icon name="help" size={20} color="#4F46E5" />
          <Text style={styles.supportButtonText}>Help Center</Text>
          <Icon name="chevron-right" size={20} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.supportButton}>
          <Icon name="contact-support" size={20} color="#4F46E5" />
          <Text style={styles.supportButtonText}>Contact Support</Text>
          <Icon name="chevron-right" size={20} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.supportButton}>
          <Icon name="description" size={20} color="#4F46E5" />
          <Text style={styles.supportButtonText}>Terms of Service</Text>
          <Icon name="chevron-right" size={20} color="#6B7280" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.supportButton}>
          <Icon name="privacy-tip" size={20} color="#4F46E5" />
          <Text style={styles.supportButtonText}>Privacy Policy</Text>
          <Icon name="chevron-right" size={20} color="#6B7280" />
        </TouchableOpacity>
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
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2D2D2D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  securityLevels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  securityLevelButton: {
    flex: 1,
    backgroundColor: '#2D2D2D',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  securityLevelButtonActive: {
    backgroundColor: '#4F46E5',
  },
  securityLevelText: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  securityLevelTextActive: {
    color: '#ffffff',
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
    marginLeft: 12,
    flex: 1,
  },
  infoLabel: {
    fontSize: 14,
    color: '#9CA3AF',
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  advancedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D2D2D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  advancedButtonText: {
    fontSize: 16,
    color: '#EF4444',
    marginLeft: 12,
    flex: 1,
  },
  supportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D2D2D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  supportButtonText: {
    fontSize: 16,
    color: '#ffffff',
    marginLeft: 12,
    flex: 1,
  },
});

export default SettingsScreen;
