import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { firebaseConfig, firebaseConfigValid, firebaseConfigError } from './firebaseConfig.js';

if (!firebaseConfigValid) {
  console.error(firebaseConfigError);
  document.body.innerHTML = `<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#08121d;color:#fff;font-family:sans-serif;text-align:center;padding:2rem;"><div><h1>Configuração Firebase inválida</h1><p>${firebaseConfigError}</p></div></div>`;
  throw new Error(firebaseConfigError);
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const loginButton = document.getElementById('loginButton');
const authTabs = document.querySelectorAll('[data-auth-tab]');
const authForms = document.querySelectorAll('.auth-panel');
const profileSection = document.getElementById('profileSection');
const userName = document.getElementById('userName');
const userRank = document.getElementById('userRank');
const userCoins = document.getElementById('userCoins');
const missionRequestForm = document.getElementById('missionRequestForm');
const missionBoardContainer = document.getElementById('missionBoardContainer');
const missionsContainer = document.getElementById('missionsContainer');
const gmButton = document.getElementById('gmButton');
const gmReviewSection = document.getElementById('gmReviewSection');
const gmReviewContainer = document.getElementById('gmReviewContainer');
const storeItemsContainer = document.getElementById('storeItemsContainer');
const activitiesContainer = document.getElementById('activitiesContainer');
const logoutButton = document.getElementById('logoutButton');
const authError = document.getElementById('authError');
const pageId = document.body?.id || '';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

function loadReCaptchaScript() {
  if (!RECAPTCHA_SITE_KEY || window.grecaptchaScriptLoaded) return;
  const script = document.createElement('script');
  script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
  script.async = true;
  script.defer = true;
  script.onload = () => {
    window.grecaptchaScriptLoaded = true;
  };
  document.head.appendChild(script);
}

loadReCaptchaScript();

const rankOrder = ['F', 'E', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'];
const defaultItems = [
  { id: 'skin-neon', name: 'Skin Neon', cost: 3, type: 'cosmético' },
  { id: 'tag-legend', name: 'Tag de Guilda', cost: 5, type: 'cosmético' },
  { id: 'emote-star', name: 'Emote Pixel', cost: 2, type: 'cosmético' },
];

let currentUser = null;
let currentProfile = null;

async function getReCaptchaToken(action) {
  if (!RECAPTCHA_SITE_KEY) {
    throw new Error('Chave do reCAPTCHA não configurada.');
  }
  if (!window.grecaptcha) {
    throw new Error('reCAPTCHA não carregado. Atualize a página.');
  }
  return new Promise((resolve, reject) => {
    window.grecaptcha.ready(async () => {
      try {
        const token = await window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action });
        resolve(token);
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function verifyReCaptcha(action) {
  const token = await getReCaptchaToken(action);
  const response = await fetch('/verify-recaptcha', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token, action }),
  });

  const text = await response.text();
  if (!text) {
    throw new Error(`Resposta vazia do servidor de reCAPTCHA. Status: ${response.status}`);
  }

  let result;
  try {
    result = JSON.parse(text);
  } catch (err) {
    throw new Error(`Resposta inválida do servidor de reCAPTCHA. Status: ${response.status}`);
  }

  if (!result || !result.success) {
    // if the server returned error codes or message, prefer that
    const msg = result?.message || (result?.errorCodes && result.errorCodes.join(', ')) || 'Falha no reCAPTCHA. Tente novamente.';
    throw new Error(msg);
  }

  return result;
}

function switchAuthTab(tabId) {
  authForms.forEach(panel => panel.classList.toggle('hidden', panel.id !== tabId));
  authTabs.forEach(tabButton => tabButton.classList.toggle('active', tabButton.dataset.authTab === tabId));
  if (loginButton) {
    loginButton.textContent = tabId === 'registerTab' ? 'Registrar' : 'Entrar';
  }
}

authTabs.forEach(tab => {
  tab.addEventListener('click', () => switchAuthTab(tab.dataset.authTab));
});

loginButton?.addEventListener('click', () => {
  const current = window.location.pathname;
  if (current.includes('/Login.html') || current.endsWith('/Login')) {
    return;
  }
  window.location.href = 'Login.html';
});

if (authTabs.length > 0) {
  switchAuthTab('loginTab');
}

logoutButton?.addEventListener('click', async () => {
  await signOut(auth);
  window.location.href = 'Home.html';
});

gmButton?.addEventListener('click', () => {
  if (!isGM()) return;
  gmReviewSection?.classList.toggle('hidden');
});

async function saveUserProfile(user, data) {
  const profileRef = doc(db, 'users', user.uid);
  await setDoc(profileRef, data);
}

async function loadUserProfile(uid) {
  const profileRef = doc(db, 'users', uid);
  const snapshot = await getDoc(profileRef);
  return snapshot.exists() ? snapshot.data() : null;
}

function rankValue(rank) {
  return rankOrder.indexOf(rank);
}

function updateHeaderUI() {
  if (!loginButton || !logoutButton) return;
  if (currentUser) {
    loginButton.classList.add('hidden');
    logoutButton.classList.remove('hidden');
  } else {
    loginButton.classList.remove('hidden');
    logoutButton.classList.add('hidden');
  }
}

function isGM() {
  return currentProfile?.guildRole === 'gm';
}

function renderUserSection(profile) {
  if (!profile) return;
  userName.textContent = profile.nickname || 'Aventureiro';
  userRank.textContent = profile.rank || 'F';
  userCoins.textContent = `${profile.coins ?? 1} platina`;
  profileSection?.classList.remove('hidden');
  updateHeaderUI();
  if (gmButton) {
    gmButton.classList.toggle('hidden', !isGM());
  }
  if (gmReviewSection && !isGM()) {
    gmReviewSection.classList.add('hidden');
  }
}

function renderMissionBoard(missions) {
  if (!missionBoardContainer) return;
  const approvedMissions = missions.filter(m => m.status === 'approved' || m.status === 'accepted');
  missionBoardContainer.innerHTML = '';
  if (approvedMissions.length === 0) {
    missionBoardContainer.innerHTML = '<p class="empty-state">Nenhuma missão aprovada disponível no momento.</p>';
    return;
  }
  approvedMissions.forEach(mission => {
    const item = document.createElement('article');
    item.className = 'quest-card';
    const requiredRank = mission.desiredRank || 'F';
    const acceptable = currentProfile && rankValue(currentProfile.rank) >= rankValue(requiredRank);
    const accepted = mission.status === 'accepted';
    item.innerHTML = `
      <span class="quest-rank">Rank ${mission.rankAssigned || requiredRank}</span>
      <h3>${mission.title}</h3>
      <p>${mission.description}</p>
      <div class="quest-meta">
        <span>UF: ${mission.state}</span>
        <span>XP: +${mission.xp}</span>
        <span>Data: ${mission.missionDate || 'a combinar'}</span>
      </div>
      <div class="mission-actions">
        ${accepted ? `<span class="mission-status">Aceita por ${mission.acceptedByNickname || 'um atendente'}</span>` : acceptable ? `<button data-id="${mission.id}" class="accept-mission">Aceitar missão</button>` : `<span class="mission-status pending">Disponível para Rank ${requiredRank}+</span>`}
      </div>
    `;
    missionBoardContainer.appendChild(item);
  });
  missionBoardContainer.querySelectorAll('.accept-mission').forEach(button => {
    button.addEventListener('click', async () => {
      const missionId = button.dataset.id;
      const docRef = doc(db, 'missions', missionId);
      const mission = missions.find(m => m.id === missionId);
      await updateDoc(docRef, {
        status: 'accepted',
        acceptedBy: currentUser.uid,
        acceptedByNickname: currentProfile.nickname,
        acceptedAt: serverTimestamp(),
      });
      showActivity(`Missão '${mission?.title}' aceita por ${currentProfile.nickname}`);
    });
  });
}

function renderQuests(missions) {
  if (!missionsContainer) return;
  const approvedMissions = missions.filter(m => m.status === 'approved' || m.status === 'accepted');
  missionsContainer.innerHTML = '';
  if (approvedMissions.length === 0) {
    missionsContainer.innerHTML = '<p class="empty-state">Nenhuma quest ativa disponível.</p>';
    return;
  }
  approvedMissions.forEach(mission => {
    const item = document.createElement('article');
    item.className = 'quest-card';
    item.innerHTML = `
      <span class="quest-rank">Rank ${mission.rankAssigned || mission.desiredRank || 'F'}</span>
      <h3>${mission.title}</h3>
      <p>${mission.description}</p>
      <div class="quest-meta">
        <span>UF: ${mission.state}</span>
        <span>XP: +${mission.xp}</span>
      </div>
    `;
    missionsContainer.appendChild(item);
  });
}

function renderGMReview(missions) {
  if (!gmReviewContainer) return;
  const pendingMissions = missions.filter(m => m.status === 'pending');
  gmReviewContainer.innerHTML = '';
  if (!isGM()) {
    if (gmReviewSection) gmReviewSection.classList.add('hidden');
    return;
  }
  if (gmReviewSection) gmReviewSection.classList.remove('hidden');
  if (pendingMissions.length === 0) {
    gmReviewContainer.innerHTML = '<p class="empty-state">Nenhuma missão aguardando aprovação.</p>';
    return;
  }
  pendingMissions.forEach(mission => {
    const item = document.createElement('article');
    item.className = 'gm-review-card';
    item.innerHTML = `
      <h3>${mission.title}</h3>
      <p>${mission.description}</p>
      <div class="quest-meta">
        <span>UF: ${mission.state}</span>
        <span>Rank solicitado: ${mission.desiredRank}</span>
        <span>Pedido por: ${mission.requestedByNickname || 'Anônimo'}</span>
      </div>
      <div class="mission-actions">
        <button data-id="${mission.id}" class="button primary approve-mission">Aprovar</button>
        <button data-id="${mission.id}" class="button secondary deny-mission">Reprovar</button>
      </div>
    `;
    gmReviewContainer.appendChild(item);
  });
  gmReviewContainer.querySelectorAll('.approve-mission').forEach(button => {
    button.addEventListener('click', async () => {
      const missionId = button.dataset.id;
      const docRef = doc(db, 'missions', missionId);
      const mission = missions.find(m => m.id === missionId);
      await updateDoc(docRef, {
        status: 'approved',
        approvedBy: currentUser.uid,
        approvedByNickname: currentProfile.nickname,
        approvedAt: serverTimestamp(),
      });
      showActivity(`Missão '${mission?.title}' aprovada pelo GM ${currentProfile.nickname}`);
    });
  });
  gmReviewContainer.querySelectorAll('.deny-mission').forEach(button => {
    button.addEventListener('click', async () => {
      const missionId = button.dataset.id;
      const docRef = doc(db, 'missions', missionId);
      const mission = missions.find(m => m.id === missionId);
      await updateDoc(docRef, {
        status: 'rejected',
        rejectedBy: currentUser.uid,
        rejectedByNickname: currentProfile.nickname,
        rejectedAt: serverTimestamp(),
      });
      showActivity(`Missão '${mission?.title}' rejeitada pelo GM ${currentProfile.nickname}`);
    });
  });
}

function renderStoreItems() {
  if (!storeItemsContainer) return;
  storeItemsContainer.innerHTML = '';
  defaultItems.forEach(item => {
    const card = document.createElement('article');
    card.className = 'store-card';
    card.innerHTML = `
      <h3>${item.name}</h3>
      <p>Tipo: ${item.type}</p>
      <div class="item-footer">
        <span>${item.cost} platina</span>
        <button data-id="${item.id}">Comprar</button>
      </div>
    `;
    card.querySelector('button').addEventListener('click', () => purchaseItem(item));
    storeItemsContainer.appendChild(card);
  });
}

async function setupMissionsListener() {
  const missionsQuery = query(collection(db, 'missions'), orderBy('createdAt', 'desc'));
  onSnapshot(missionsQuery, snapshot => {
    const missions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderMissionBoard(missions);
    renderQuests(missions);
    renderGMReview(missions);
  });
}

async function purchaseItem(item) {
  if (!currentProfile) return;
  const totalCost = Math.ceil(item.cost * 1.03);
  if ((currentProfile.coins ?? 1) < totalCost) {
    alert('Saldo insuficiente. Conclua missões para ganhar mais platina.');
    return;
  }
  const profileRef = doc(db, 'users', currentUser.uid);
  await updateDoc(profileRef, {
    coins: (currentProfile.coins ?? 1) - totalCost,
  });
  showActivity(`${currentProfile.nickname} comprou ${item.name} por ${totalCost} platina (3% guilda).`);
}

function showActivity(message) {
  addDoc(collection(db, 'activities'), {
    message,
    createdAt: serverTimestamp(),
  });
}

function renderActivityFeed(items) {
  activitiesContainer.innerHTML = '';
  items.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'activity-item';
    row.textContent = entry.message;
    activitiesContainer.appendChild(row);
  });
}

function setupActivityListener() {
  const activitiesQuery = query(collection(db, 'activities'), orderBy('createdAt', 'desc'));
  onSnapshot(activitiesQuery, snapshot => {
    const activities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderActivityFeed(activities);
  });
}

missionRequestForm?.addEventListener('submit', async event => {
  event.preventDefault();
  if (!currentUser || !currentProfile) return;

  const title = missionRequestForm['missionTitle'].value.trim();
  const description = missionRequestForm['missionDescription'].value.trim();
  const state = missionRequestForm['missionState'].value;
  const desiredRank = missionRequestForm['missionRank'].value;

  if (!title || !description) {
    authError.textContent = 'Preencha título e descrição da missão.';
    return;
  }

  const missionDate = missionRequestForm['missionDate'].value || '';
  await addDoc(collection(db, 'missions'), {
    title,
    description,
    requestedBy: currentUser.uid,
    requestedByNickname: currentProfile.nickname,
    state,
    desiredRank,
    missionDate,
    rankAssigned: 'F',
    status: 'pending',
    xp: 50,
    createdAt: serverTimestamp(),
  });

  showActivity(`Nova missão solicitada por ${currentProfile.nickname} em ${state}.`);
  missionRequestForm.reset();
});

async function updateProfileUI() {
  if (!currentUser) return;
  currentProfile = await loadUserProfile(currentUser.uid);
  renderUserSection(currentProfile);
  renderStoreItems();
  updateHeaderUI();
}

onAuthStateChanged(auth, async user => {
  currentUser = user;
  updateHeaderUI();
  if (user) {
    await updateProfileUI();
    if (pageId === 'loginPage' || pageId === 'registerPage' || pageId === 'homePage') {
      window.location.href = 'Hub.html';
    }
  } else {
    currentProfile = null;
    profileSection?.classList.add('hidden');
    if (gmButton) gmButton.classList.add('hidden');
    if (pageId === 'hubPage') {
      window.location.href = 'Login.html';
    }
  }
});

setupMissionsListener();
setupActivityListener();

const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const googleLoginButton = document.getElementById('googleLogin');

registerForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const email = registerForm['registerEmail'].value.trim();
  const password = registerForm['registerPassword'].value;
  const nickname = registerForm['registerNickname'].value.trim();
  const uf = registerForm['registerState'].value;
  const address = registerForm['registerAddress'].value.trim();
  const discovered = registerForm['registerDiscover'].value.trim();
  const rules = registerForm['registerRules'].checked;

  if (!email || !password || !nickname || !uf || !address || !discovered || !rules) {
    authError.textContent = 'Preencha todos os campos e aceite as regras para continuar.';
    return;
  }

  try {
    await verifyReCaptcha('register');
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await saveUserProfile(user, {
      email,
      nickname,
      state: uf,
      address,
      discovered,
      method: 'email',
      rank: 'F',
      coins: 1,
      platinum: 1,
      guildRole: 'member',
      approvedByGM: false,
      createdAt: serverTimestamp(),
      ipAddress: 'pending',
    });
    showActivity(`Novo registro: ${nickname} (${uf})`);
    authError.textContent = '';
  } catch (error) {
    authError.textContent = error.message;
  }
});

loginForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const email = loginForm['loginEmail'].value.trim();
  const password = loginForm['loginPassword'].value;
  if (!email || !password) {
    authError.textContent = 'Informe seu e-mail e senha.';
    return;
  }

  try {
    await verifyReCaptcha('login');
    await signInWithEmailAndPassword(auth, email, password);
    authError.textContent = '';
  } catch (error) {
    authError.textContent = error.message;
  }
});

googleLoginButton?.addEventListener('click', async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    const profile = await loadUserProfile(user.uid);
    if (!profile) {
      const nickname = prompt('Escolha um nickname para sua guilda:');
      const uf = prompt('Informe seu estado (UF):');
      const address = prompt('Endereço completo:');
      const discovered = prompt('Como descobriu o PixelTrove?');
      if (!nickname || !uf || !address || !discovered) {
        alert('Cadastro incompleto. Complete todos os dados depois na página de perfil.');
      }
      await saveUserProfile(user, {
        email: user.email,
        nickname: nickname || 'Novo Membro',
        state: uf || 'BR',
        address: address || '',
        discovered: discovered || 'Google',
        method: 'google',
        rank: 'F',
        coins: 1,
        platinum: 1,
        guildRole: 'member',
        approvedByGM: false,
        createdAt: serverTimestamp(),
        ipAddress: 'pending',
      });
    }
    authError.textContent = '';
  } catch (error) {
    authError.textContent = error.message;
  }
});
