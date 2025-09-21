declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    multiGet(keys: string[]): Promise<[string, string | null][]>;
  };
  export default AsyncStorage;
}
