import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export interface ImagePickerResult {
  uri: string;
  success: boolean;
}

// Solicitar permissões
export async function requestPermissions(): Promise<boolean> {
  try {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const mediaLibraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    return cameraPermission.status === 'granted' && mediaLibraryPermission.status === 'granted';
  } catch (error) {
    console.error('Erro ao solicitar permissões:', error);
    return false;
  }
}

// Selecionar imagem da galeria
export async function pickImageFromGallery(): Promise<ImagePickerResult> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const processedImage = await processImage(result.assets[0].uri);
      return {
        uri: processedImage,
        success: true
      };
    }

    return { uri: '', success: false };
  } catch (error) {
    console.error('Erro ao selecionar imagem da galeria:', error);
    return { uri: '', success: false };
  }
}

// Tirar foto com a câmera
export async function takePhotoWithCamera(): Promise<ImagePickerResult> {
  try {
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets?.[0]) {
      const processedImage = await processImage(result.assets[0].uri);
      return {
        uri: processedImage,
        success: true
      };
    }

    return { uri: '', success: false };
  } catch (error) {
    console.error('Erro ao tirar foto:', error);
    return { uri: '', success: false };
  }
}

// Processar imagem (redimensionar e comprimir)
async function processImage(uri: string): Promise<string> {
  try {
    const manipulatedImage = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 300, height: 300 } }],
      { 
        compress: 0.7,
        format: ImageManipulator.SaveFormat.JPEG
      }
    );
    
    return manipulatedImage.uri;
  } catch (error) {
    console.error('Erro ao processar imagem:', error);
    return uri; // retorna a URI original em caso de erro
  }
}