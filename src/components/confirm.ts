/** Yes/no prompt that also works on web (Alert.alert with buttons does nothing there). */
import { Alert, Platform } from 'react-native';

export function confirm(title: string, message: string, okText = 'OK'): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${message}`));
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okText, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}
