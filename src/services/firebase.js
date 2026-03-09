// src/services/firebase.js — FitZone
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import {
  getFirestore, doc, setDoc, getDoc, deleteDoc, collection, query, where,
  limit, getDocs, updateDoc, addDoc, Timestamp, serverTimestamp,
  increment, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';

// 🔑 Configurações extraídas do seu console Firebase
const firebaseConfig = {
  apiKey: "AIzaSyA-9Htb5wI1k3NXyK12T8ceMWtvF-NuoSs",
  authDomain: "fitzone-8719f.firebaseapp.com",
  projectId: "fitzone-8719f",
  storageBucket: "fitzone-8719f.firebasestorage.app",
  messagingSenderId: "264831726073",
  appId: "1:264831726073:web:e7a20ada0dd645d1e5cd28"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged, Timestamp };

// ===================== AUTH =====================
export async function registerUser(data) {
  const { email, password, name, phone, city, state, role, goal, level } = data;
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  const uid = cred.user.uid;
  const now = new Date();
  const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 dias de teste
  const user = {
    uid, name, email,
    phone: phone || '', city: city || '', state: state || '',
    role: role || 'aluno',       
    goal: goal || 'Hipertrofia',
    level: level || 'Iniciante',
    registrationDate: Timestamp.fromDate(now),
    expirationDate: Timestamp.fromDate(expiry),
    isActive: true, isAdmin: false, isExpired: false,
    totalWorkouts: 0, personalUid: '', personalName: ''
  };
  await setDoc(doc(db, 'fz_users', uid), user);
  await addDoc(collection(db, 'fz_notifications'), {
    userId: uid,
    title: '💪 Bem-vindo ao FitZone!',
    message: 'Seu acesso gratuito é válido por 30 dias. Bons treinos!',
    read: false, createdAt: serverTimestamp()
  });
  return user;
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(db, 'fz_users', cred.user.uid));
  if (!snap.exists()) throw new Error('USER_NOT_FOUND');
  const user = snap.data();
  if (!user.isAdmin) {
    if (!user.isActive) throw new Error('BLOCKED');
    const expiry = user.expirationDate?.toDate?.();
    if (expiry && expiry < new Date()) throw new Error('EXPIRED');
  }
  return user;
}

export async function getCurrentUser() {
  const u = auth.currentUser;
  if (!u) return null;
  const snap = await getDoc(doc(db, 'fz_users', u.uid));
  return snap.exists() ? snap.data() : null;
}

export async function updateUserProfile(uid, data) {
  await updateDoc(doc(db, 'fz_users', uid), { ...data, updatedAt: serverTimestamp() });
}

export async function logoutUser() { await signOut(auth); }
export function resetPassword(email) { return sendPasswordResetEmail(auth, email); }

// ===================== TREINOS =====================
export async function getMyWorkouts(uid) {
  const q = query(collection(db, 'fz_workouts'), where('assignedTo', 'array-contains', uid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.letter || '').localeCompare(b.letter || ''));
}

export async function getWorkoutsCreatedBy(personalUid) {
  const q = query(collection(db, 'fz_workouts'), where('createdBy', '==', personalUid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.letter || '').localeCompare(b.letter || ''));
}

export async function createWorkout(data, createdBy, createdByName) {
  const ref = await addDoc(collection(db, 'fz_workouts'), {
    ...data, createdBy, createdByName, createdAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateWorkout(id, data) {
  await updateDoc(doc(db, 'fz_workouts', id), { ...data, updatedAt: serverTimestamp() });
}

export async function deleteWorkout(id) { await deleteDoc(doc(db, 'fz_workouts', id)); }

export async function assignWorkout(workoutId, studentUid) {
  await updateDoc(doc(db, 'fz_workouts', workoutId), { assignedTo: arrayUnion(studentUid) });
}

export async function unassignWorkout(workoutId, studentUid) {
  await updateDoc(doc(db, 'fz_workouts', workoutId), { assignedTo: arrayRemove(studentUid) });
}

// ===================== CARGA / EVOLUÇÃO =====================
export async function logLoad(data, userId) {
  await addDoc(collection(db, 'fz_loads'), { ...data, userId, createdAt: serverTimestamp() });
}

export async function getAllLoads(userId) {
  const q = query(collection(db, 'fz_loads'), where('userId', '==', userId), limit(200));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function deleteLoad(id) { await deleteDoc(doc(db, 'fz_loads', id)); }

// ===================== FREQUÊNCIA =====================
export async function checkIn(userId, userName, workoutId, workoutName) {
  const today = new Date().toISOString().split('T')[0];
  const q = query(collection(db, 'fz_checkins'), where('userId', '==', userId), where('date', '==', today));
  const existing = await getDocs(q);
  if (!existing.empty) return false;
  await addDoc(collection(db, 'fz_checkins'), {
    userId, userName, workoutId: workoutId || '', workoutName: workoutName || 'Treino livre',
    date: today, createdAt: serverTimestamp()
  });
  await updateDoc(doc(db, 'fz_users', userId), { totalWorkouts: increment(1) });
  return true;
}

export async function getCheckins(userId, month) {
  const q = query(collection(db, 'fz_checkins'), where('userId', '==', userId), limit(120));
  const snap = await getDocs(q);
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  if (month) return all.filter(c => c.date?.startsWith(month)).sort((a,b) => b.date?.localeCompare(a.date));
  return all.sort((a, b) => b.date?.localeCompare(a.date));
}

// ===================== AVALIAÇÃO FÍSICA =====================
export async function getAssessments(userId) {
  const q = query(collection(db, 'fz_assessments'), where('userId', '==', userId), limit(30));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => b.date?.localeCompare(a.date || ''));
}

export async function addAssessment(data, userId, userName) {
  await addDoc(collection(db, 'fz_assessments'), {
    ...data, userId, userName, createdAt: serverTimestamp()
  });
}

export async function deleteAssessment(id) { await deleteDoc(doc(db, 'fz_assessments', id)); }

// ===================== PLANO ALIMENTAR =====================
export async function getDietPlan(userId) {
  const snap = await getDoc(doc(db, 'fz_diets', userId));
  return snap.exists() ? snap.data() : null;
}

export async function saveDietPlan(userId, data) {
  await setDoc(doc(db, 'fz_diets', userId), { ...data, updatedAt: serverTimestamp() });
}

// ===================== FEED / COMUNICADOS =====================
export async function getAnnouncements(lim) {
  lim = lim || 30;
  const q = query(collection(db, 'fz_announcements'), limit(lim));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function createAnnouncement(content, category, authorUid, authorName) {
  await addDoc(collection(db, 'fz_announcements'), {
    content, category, authorUid, authorName,
    likes: 0, likedBy: [], createdAt: serverTimestamp()
  });
}

export async function toggleAnnounceLike(id, uid) {
  const ref = doc(db, 'fz_announcements', id);
  const snap = await getDoc(ref);
  const liked = snap.data()?.likedBy?.includes(uid);
  await updateDoc(ref, {
    likedBy: liked ? arrayRemove(uid) : arrayUnion(uid),
    likes: increment(liked ? -1 : 1)
  });
}

// ===================== NOTIFICAÇÕES =====================
export async function getNotifications(userId) {
  const q = query(collection(db, 'fz_notifications'), where('userId', '==', userId), limit(20));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

export async function markNotifRead(id) {
  await updateDoc(doc(db, 'fz_notifications', id), { read: true });
}

// ===================== ALUNOS (visão do personal) =====================
export async function getStudentsByPersonal(personalUid) {
  const q = query(collection(db, 'fz_users'), where('personalUid', '==', personalUid));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data() }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

export async function linkStudentToPersonal(studentUid, personalUid, personalName) {
  await updateDoc(doc(db, 'fz_users', studentUid), { personalUid, personalName });
}

// ===================== ADMIN =====================
export async function getAllUsers() {
  const snap = await getDocs(collection(db, 'fz_users'));
  return snap.docs.map(d => ({ ...d.data() }));
}

export async function toggleUserActive(uid, isActive) {
  await updateDoc(doc(db, 'fz_users', uid), { isActive });
}

export async function renewAccess(uid, days) {
  const now = new Date();
  const expiry = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  await updateDoc(doc(db, 'fz_users', uid), {
    expirationDate: Timestamp.fromDate(expiry),
    isExpired: false, isActive: true
  });
}

export async function getAdminStats() {
  const users = await getAllUsers();
  const now = Date.now();
  return {
    total: users.length,
    active: users.filter(u => u.isActive && !u.isExpired).length,
    expiring: users.filter(u => {
      const d = u.expirationDate?.toDate?.();
      if (!d) return false;
      const diff = (d - now) / (1000 * 60 * 60 * 24);
      return diff >= 0 && diff <= 7;
    }).length,
    expired: users.filter(u => {
      const d = u.expirationDate?.toDate?.();
      return d && d < new Date();
    }).length
  };
}

export async function deleteItem(col, id) { await deleteDoc(doc(db, col, id)); }
export async function updateItem(col, id, data) { await updateDoc(doc(db, col, id), data); }