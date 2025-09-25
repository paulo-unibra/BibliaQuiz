import { auth } from '@/lib/firebase';
import {
    pickImageFromGallery,
    requestPermissions,
    takePhotoWithCamera
} from '@/lib/imageUtils';
import {
    authenticateAnonymously,
    createOrUpdateUserProfile,
    getCurrentUserProfile,
    uploadProfileImage,
    UserProfile
} from '@/lib/userService';
import { onAuthStateChanged, User } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface ProfileScreenProps {
  onProfileComplete: (profile: UserProfile) => void;
  onBack: () => void;
}

export default function ProfileScreen({ onProfileComplete, onBack }: ProfileScreenProps) {
  const [nome, setNome] = useState('');
  const [fotoURL, setFotoURL] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [currentProfile, setCurrentProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    console.log('📱 ProfileScreen: Configurando monitoramento de autenticação...');
    
    let isAuthenticating = false; // Flag para evitar múltiplas autenticações
    
    const unsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
      console.log('📱 ProfileScreen: Estado de autenticação mudou:', user ? `UID: ${user.uid}` : 'Não autenticado');
      
      try {
        if (user) {
          // Usuário já está autenticado - buscar perfil
          console.log('📱 ProfileScreen: Usuário autenticado, buscando perfil...');
          const profile = await getCurrentUserProfile();
          console.log('📱 ProfileScreen: Perfil encontrado:', profile);
          
          if (profile) {
            // Preencher campos com dados existentes
            setCurrentProfile(profile);
            setNome(profile.nome);
            setFotoURL(profile.fotoURL || '');
            console.log('📱 ProfileScreen: Estado do perfil atualizado:', {
              nome: profile.nome,
              score: profile.score,
              hasPhoto: !!profile.fotoURL
            });
          } else {
            console.log('📱 ProfileScreen: Nenhum perfil encontrado - usuário novo');
            setCurrentProfile(null);
          }
          isAuthenticating = false; // Reset flag
        } else if (!isAuthenticating) {
          // Não há usuário e não estamos já autenticando - iniciar autenticação anônima uma vez
          console.log('📱 ProfileScreen: Nenhum usuário encontrado, iniciando autenticação anônima...');
          isAuthenticating = true;
          await authenticateAnonymously();
          // O listener será chamado novamente quando a autenticação completar
        }
      } catch (error) {
        console.error('❌ ProfileScreen: Erro no monitoramento de autenticação:', error);
        Alert.alert('Erro', 'Falha ao inicializar usuário');
        isAuthenticating = false; // Reset flag em caso de erro
      } finally {
        setInitializing(false);
        console.log('📱 ProfileScreen: Inicialização concluída');
      }
    });

    // Cleanup function para remover o listener
    return () => {
      console.log('📱 ProfileScreen: Removendo monitoramento de autenticação');
      unsubscribe();
    };
  }, []);

  const handleImageSelection = async () => {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) {
      Alert.alert(
        'Permissões necessárias',
        'É necessário conceder permissões para câmera e galeria.'
      );
      return;
    }

    Alert.alert(
      'Selecionar Foto',
      'Escolha uma opção:',
      [
        { text: 'Câmera', onPress: () => handleCamera() },
        { text: 'Galeria', onPress: () => handleGallery() },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  };

  const handleCamera = async () => {
    const result = await takePhotoWithCamera();
    if (result.success) {
      setFotoURL(result.uri);
    }
  };

  const handleGallery = async () => {
    const result = await pickImageFromGallery();
    if (result.success) {
      setFotoURL(result.uri);
    }
  };

  const handleSaveProfile = async () => {
    if (!nome.trim()) {
      Alert.alert('Erro', 'Por favor, digite um nome ou apelido');
      return;
    }

    try {
      setLoading(true);

      let finalImageURL = '';
      
      // Upload da imagem se selecionada
      if (fotoURL && !fotoURL.startsWith('http')) {
        finalImageURL = await uploadProfileImage(fotoURL);
      } else {
        finalImageURL = fotoURL;
      }

      // Criar/atualizar perfil
      await createOrUpdateUserProfile(nome.trim(), finalImageURL);

      // Buscar perfil atualizado
      const updatedProfile = await getCurrentUserProfile();
      if (updatedProfile) {
        onProfileComplete(updatedProfile);
      }
    } catch (error: any) {
      console.error('Erro ao salvar perfil:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
      Alert.alert('Erro', `Falha ao salvar perfil: ${error.message || error.toString()}`);
    } finally {
      setLoading(false);
    }
  };

  if (initializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>Inicializando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Voltar</Text>
          </Pressable>
          <Text style={styles.title}>
            {currentProfile ? 'Editar Perfil' : 'Criar Perfil'}
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.imageContainer}>
            <Pressable onPress={handleImageSelection} style={styles.imageButton}>
              {fotoURL ? (
                <Image source={{ uri: fotoURL }} style={styles.profileImage} />
              ) : (
                <View style={styles.placeholderImage}>
                  <Text style={styles.placeholderText}>+</Text>
                </View>
              )}
            </Pressable>
            <Text style={styles.imageHint}>Toque para {fotoURL ? 'alterar' : 'adicionar'} foto</Text>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Nome ou Apelido</Text>
            <TextInput
              style={styles.textInput}
              value={nome}
              onChangeText={setNome}
              placeholder="Digite seu nome ou apelido"
              placeholderTextColor="#9ca3af"
              maxLength={50}
            />
          </View>

          {currentProfile && (
            <View style={styles.scoreContainer}>
              <Text style={styles.scoreLabel}>Pontuação Atual</Text>
              <Text style={styles.scoreValue}>{currentProfile.score}</Text>
            </View>
          )}

          <Pressable
            onPress={handleSaveProfile}
            disabled={loading || !nome.trim()}
            style={[
              styles.saveButton,
              (!nome.trim() || loading) && styles.saveButtonDisabled
            ]}
          >
            {loading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.saveButtonText}>
                {currentProfile ? 'Salvar Alterações' : 'Criar Perfil'}
              </Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  backButton: {
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '500',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  imageContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  imageButton: {
    marginBottom: 8,
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#3b82f6',
  },
  placeholderImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#e5e7eb',
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    fontSize: 32,
    color: '#9ca3af',
    fontWeight: '300',
  },
  imageHint: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: 'white',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    fontSize: 16,
    color: '#1f2937',
  },
  scoreContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  scoreLabel: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 4,
  },
  scoreValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#3b82f6',
  },
  saveButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 'auto',
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});