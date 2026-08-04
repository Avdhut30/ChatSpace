import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/database';

const config = {
  apiKey: 'AIzaSyCxpmWGPpibcwjbM2x2N9k4Zy9OUJsjIAE',
  authDomain: 'chat-web-app-d3b70.firebaseapp.com',
  projectId: 'chat-web-app-d3b70',
  messagingSenderId: '1033057028497',
  appId: '1:1033057028497:web:1ad9546ca57ea42029b230',
};

// Vite re-evaluates modules during hot reload. Reuse Firebase's default app so
// an older in-memory config cannot trigger an app/duplicate-app exception.
const app = firebase.apps.length
  ? firebase.app()
  : firebase.initializeApp(config);

export const auth = app.auth();
export const database = app.database();
