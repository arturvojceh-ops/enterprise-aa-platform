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
}

const RecoveryScreen: React.FC<Props> = ({ walletAddress }) => {
  const [guardians, setGuardians] = useState<string[]>([]);
  const [newGuardian, setNewGuardian] = useState('');
  const [requiredGuardians, setRequiredGuardians] = useState(3);
  const [recoveryStatus, setRecoveryStatus] = useState<'idle' | 'initiated' | 'completed'>('idle');
  const [newOwner, setNewOwner] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [approvals, setApprovals] = useState<{[key: string]: boolean}>({});

  useEffect(() => {
    loadGuardians();
  }, []);

  const loadGuardians = async () => {
    // Load guardians from smart contract
    const mockGuardians = [
      '0x1234567890123456789012345678901234567890',
      '0x2345678901234567890123456789012345678901',
      '0x3456789012345678901234567890123456789012',
    ];
    setGuardians(mockGuardians);
  };

  const addGuardian = async () => {
    if (!newGuardian || !ethers.utils.isAddress(newGuardian)) {
      Alert.alert('Error', 'Invalid guardian address');
      return;
    }

    if (guardians.length >= 5) {
      Alert.alert('Error', 'Maximum 5 guardians allowed');
      return;
    }

    setIsProcessing(true);

    try {
      // Add guardian to smart contract
      const response = await fetch('http://localhost:3000/api/wallet/guardian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          guardianAddress: newGuardian,
          action: 'add'
        })
      });

      const result = await response.json();

      if (result.success) {
        setGuardians([...guardians, newGuardian]);
        setNewGuardian('');
        Alert.alert('Success', 'Guardian added successfully');
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const removeGuardian = async (guardianAddress: string) => {
    if (guardians.length <= requiredGuardians) {
      Alert.alert('Error', 'Cannot remove guardian below required threshold');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('http://localhost:3000/api/wallet/guardian', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          guardianAddress,
          action: 'remove'
        })
      });

      const result = await response.json();

      if (result.success) {
        setGuardians(guardians.filter(g => g !== guardianAddress));
        Alert.alert('Success', 'Guardian removed successfully');
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const initiateRecovery = async () => {
    if (!newOwner || !ethers.utils.isAddress(newOwner)) {
      Alert.alert('Error', 'Invalid new owner address');
      return;
    }

    setIsProcessing(true);

    try {
      const response = await fetch('http://localhost:3000/api/wallet/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          newOwner,
          guardians: guardians.slice(0, requiredGuardians)
        })
      });

      const result = await response.json();

      if (result.success) {
        setRecoveryStatus('initiated');
        Alert.alert(
          'Recovery Initiated',
          `Recovery process started. ${requiredGuardians} guardian approvals required.`
        );
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const approveRecovery = async (guardianAddress: string) => {
    setIsProcessing(true);

    try {
      const response = await fetch('http://localhost:3000/api/wallet/recovery/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          guardianAddress,
          newOwner
        })
      });

      const result = await response.json();

      if (result.success) {
        setApprovals({...approvals, [guardianAddress]: true});
        
        const approvalCount = Object.keys(approvals).length + 1;
        if (approvalCount >= requiredGuardians) {
          setRecoveryStatus('completed');
          Alert.alert(
            'Recovery Completed',
            'Wallet ownership has been transferred successfully.'
          );
        } else {
          Alert.alert(
            'Approval Recorded',
            `${approvalCount}/${requiredGuardians} approvals received.`
          );
        }
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Social Recovery</Text>
        <Text style={styles.subtitle}>3-5 Guardian System</Text>
      </View>

      <View style={styles.statusCard}>
        <Icon name="security" size={40} color="#4F46E5" />
        <Text style={styles.statusTitle}>
          Recovery Status: {recoveryStatus.toUpperCase()}
        </Text>
        <Text style={styles.statusDescription}>
          {recoveryStatus === 'idle' && 'No recovery process active'}
          {recoveryStatus === 'initiated' && 'Waiting for guardian approvals'}
          {recoveryStatus === 'completed' && 'Recovery completed successfully'}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Guardians ({guardians.length}/5)</Text>
        
        {guardians.map((guardian, index) => (
          <View key={index} style={styles.guardianItem}>
            <View style={styles.guardianInfo}>
              <Icon name="person" size={20} color="#4F46E5" />
              <Text style={styles.guardianAddress}>
                {guardian.slice(0, 6)}...{guardian.slice(-4)}
              </Text>
              {approvals[guardian] && (
                <Icon name="check-circle" size={20} color="#10B981" />
              )}
            </View>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeGuardian(guardian)}
              disabled={isProcessing}
            >
              <Icon name="remove-circle" size={20} color="#EF4444" />
            </TouchableOpacity>
          </View>
        ))}

        <View style={styles.addGuardianForm}>
          <TextInput
            style={styles.input}
            value={newGuardian}
            onChangeText={setNewGuardian}
            placeholder="Add guardian address..."
            placeholderTextColor="#6B7280"
          />
          <TouchableOpacity
            style={styles.addButton}
            onPress={addGuardian}
            disabled={isProcessing}
          >
            <Icon name="add-circle" size={24} color="#4F46E5" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recovery Settings</Text>
        
        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Required Guardians</Text>
          <View style={styles.counter}>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => setRequiredGuardians(Math.max(1, requiredGuardians - 1))}
            >
              <Icon name="remove" size={20} color="#ffffff" />
            </TouchableOpacity>
            <Text style={styles.counterValue}>{requiredGuardians}</Text>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => setRequiredGuardians(Math.min(guardians.length, requiredGuardians + 1))}
            >
              <Icon name="add" size={20} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Initiate Recovery</Text>
        
        <TextInput
          style={styles.input}
          value={newOwner}
          onChangeText={setNewOwner}
          placeholder="New owner address..."
          placeholderTextColor="#6B7280"
        />

        <TouchableOpacity
          style={[styles.recoveryButton, isProcessing && styles.recoveryButtonDisabled]}
          onPress={initiateRecovery}
          disabled={isProcessing || recoveryStatus !== 'idle'}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Icon name="security" size={20} color="#ffffff" />
              <Text style={styles.recoveryButtonText}>Initiate Recovery</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {recoveryStatus === 'initiated' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Guardian Approvals</Text>
          
          {guardians.slice(0, requiredGuardians).map((guardian, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.approvalItem,
                approvals[guardian] && styles.approvalItemApproved
              ]}
              onPress={() => approveRecovery(guardian)}
              disabled={isProcessing || approvals[guardian]}
            >
              <Icon 
                name={approvals[guardian] ? "check-circle" : "radio-button-unchecked"} 
                size={24} 
                color={approvals[guardian] ? "#10B981" : "#6B7280"} 
              />
              <Text style={styles.approvalText}>
                Guardian #{index + 1}: {guardian.slice(0, 6)}...{guardian.slice(-4)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.infoSection}>
        <Text style={styles.sectionTitle}>Security Information</Text>
        
        <View style={styles.infoItem}>
          <Icon name="info" size={20} color="#4F46E5" />
          <Text style={styles.infoText}>
            Social recovery allows you to regain access to your wallet if you lose your private key.
          </Text>
        </View>

        <View style={styles.infoItem}>
          <Icon name="group" size={20} color="#4F46E5" />
          <Text style={styles.infoText}>
            Choose trusted guardians who can help you recover your wallet.
          </Text>
        </View>

        <View style={styles.infoItem}>
          <Icon name="timer" size={20} color="#4F46E5" />
          <Text style={styles.infoText}>
            Recovery process takes 7 days to complete for security reasons.
          </Text>
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
  statusCard: {
    margin: 20,
    padding: 20,
    backgroundColor: '#2D2D2D',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#4F46E5',
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginTop: 12,
    marginBottom: 4,
  },
  statusDescription: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  guardianItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D2D2D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  guardianInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  guardianAddress: {
    fontSize: 14,
    color: '#ffffff',
    marginLeft: 12,
    fontFamily: 'monospace',
    flex: 1,
  },
  removeButton: {
    padding: 4,
  },
  addGuardianForm: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#2D2D2D',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: '#ffffff',
    borderWidth: 1,
    borderColor: '#374151',
    marginRight: 12,
  },
  addButton: {
    padding: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#2D2D2D',
    padding: 16,
    borderRadius: 12,
  },
  settingLabel: {
    fontSize: 16,
    color: '#ffffff',
  },
  counter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  counterButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 4,
    padding: 4,
  },
  counterValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
    marginHorizontal: 16,
  },
  recoveryButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  recoveryButtonDisabled: {
    backgroundColor: '#374151',
  },
  recoveryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  approvalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2D2D2D',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  approvalItemApproved: {
    backgroundColor: '#065F46',
  },
  approvalText: {
    fontSize: 14,
    color: '#ffffff',
    marginLeft: 12,
    flex: 1,
  },
  infoSection: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginLeft: 12,
    flex: 1,
    lineHeight: 20,
  },
});

export default RecoveryScreen;
