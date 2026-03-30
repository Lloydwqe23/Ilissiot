import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../hooks/useAuth';

export function AuthScreen() {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { login, register } = useAuth();

  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    email: '',
    username: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });

  const handleLogin = async () => {
    setError('');
    if (!loginForm.email || !loginForm.password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      await login(loginForm);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError('');

    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const normalizedUsername = registerForm.username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(normalizedUsername)) {
      setError('Username must be 3-32 chars: a-z, 0-9, _');
      return;
    }

    if (registerForm.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await register({
        email: registerForm.email,
        username: normalizedUsername,
        password: registerForm.password,
        firstName: registerForm.firstName || null,
        lastName: registerForm.lastName || null,
      });
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Header */}
        <LinearGradient
          colors={['#8fd3ff', '#59b9f9']}
          style={[styles.header, { paddingTop: Math.max(insets.top + 12, 60) }]}
        >
          <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
          <Text style={styles.appName}>Ilissiot</Text>
          <Text style={styles.tagline}>Secure messaging, redefined</Text>
        </LinearGradient>

        {/* Form */}
        <View style={styles.formContainer}>
          {/* Tab switcher */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, mode === 'login' && styles.activeTab]}
              onPress={() => { setMode('login'); setError(''); }}
            >
              <Text style={[styles.tabText, mode === 'login' && styles.activeTabText]}>
                Sign In
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, mode === 'register' && styles.activeTab]}
              onPress={() => { setMode('register'); setError(''); }}
            >
              <Text style={[styles.tabText, mode === 'register' && styles.activeTabText]}>
                Sign Up
              </Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {mode === 'login' ? (
            <View style={styles.form}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={loginForm.email}
                onChangeText={(text) => setLoginForm({ ...loginForm, email: text })}
                placeholder="Enter your email"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={loginForm.password}
                onChangeText={(text) => setLoginForm({ ...loginForm, password: text })}
                placeholder="Enter your password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Sign In</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.form}>
              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.label}>First Name</Text>
                  <TextInput
                    style={styles.input}
                    value={registerForm.firstName}
                    onChangeText={(text) => setRegisterForm({ ...registerForm, firstName: text })}
                    placeholder="First name"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.label}>Last Name</Text>
                  <TextInput
                    style={styles.input}
                    value={registerForm.lastName}
                    onChangeText={(text) => setRegisterForm({ ...registerForm, lastName: text })}
                    placeholder="Last name"
                    placeholderTextColor="#94a3b8"
                  />
                </View>
              </View>

              <Text style={styles.label}>Username</Text>
              <TextInput
                style={styles.input}
                value={registerForm.username}
                onChangeText={(text) => setRegisterForm({ ...registerForm, username: text })}
                placeholder="Choose a username"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={registerForm.email}
                onChangeText={(text) => setRegisterForm({ ...registerForm, email: text })}
                placeholder="Enter your email"
                placeholderTextColor="#94a3b8"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={registerForm.password}
                onChangeText={(text) => setRegisterForm({ ...registerForm, password: text })}
                placeholder="Create a password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
              />

              <Text style={styles.label}>Confirm Password</Text>
              <TextInput
                style={styles.input}
                value={registerForm.confirmPassword}
                onChangeText={(text) => setRegisterForm({ ...registerForm, confirmPassword: text })}
                placeholder="Confirm your password"
                placeholderTextColor="#94a3b8"
                secureTextEntry
              />

              <TouchableOpacity
                style={[styles.button, loading && styles.buttonDisabled]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Create Account</Text>
                )}
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
  },
  header: {
    paddingBottom: 40,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  logoImage: {
    width: 60,
    height: 60,
    borderRadius: 14,
    marginBottom: 10,
  },
  appName: {
    fontSize: 32,
    fontWeight: '900',
    fontFamily: Platform.select({ ios: 'Times New Roman', android: 'serif', default: 'serif' }),
    letterSpacing: 0.3,
    color: '#fff',
    marginBottom: 4,
  },
  tagline: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  formContainer: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  activeTabText: {
    color: '#2f8ed6',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
  },
  form: {
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  halfField: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1a1a2e',
  },
  button: {
    backgroundColor: '#44aaf0',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
