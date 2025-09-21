export const API_BASE = process.env.EXPO_PUBLIC_API_BASE || '';

export const hasApi = () => typeof API_BASE === 'string' && API_BASE.length > 0;

export const DRIVE_INDEX_FILE_ID = process.env.EXPO_PUBLIC_DRIVE_INDEX_FILE_ID || '';
export const hasDriveIndex = () => typeof DRIVE_INDEX_FILE_ID === 'string' && DRIVE_INDEX_FILE_ID.length > 0;

export const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY || '';
export const DRIVE_FOLDER_ID = process.env.EXPO_PUBLIC_DRIVE_FOLDER_ID || '';
export const hasDriveApi = () =>
	typeof GOOGLE_API_KEY === 'string' && GOOGLE_API_KEY.length > 0 &&
	typeof DRIVE_FOLDER_ID === 'string' && DRIVE_FOLDER_ID.length > 0;
