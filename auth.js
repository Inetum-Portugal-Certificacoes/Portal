// Autenticação OTP com Supabase
// Configuração carregada de window.__SUPABASE_CONFIG__ (injetado no HTML)

let supabaseClient = null;
let initAttempts = 0;
const MAX_INIT_ATTEMPTS = 15;
const INIT_RETRY_DELAY = 300; // ms

async function waitForSupabaseClient(timeoutMs = 8000) {
  const start = Date.now();
  while (!supabaseClient && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return supabaseClient;
}

function initializeSupabaseClient() {
  initAttempts++;
  const logMsg = `[Auth] Attempt ${initAttempts}/${MAX_INIT_ATTEMPTS}`;
  console.log(`${logMsg}: Inicializando Supabase client...`);
  
  if (!window.__SUPABASE_CONFIG__) {
    console.warn(`${logMsg}: config.js não carregado ainda. Tentando novamente...`);
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      setTimeout(initializeSupabaseClient, INIT_RETRY_DELAY);
    } else {
      console.error(`${logMsg}: FALHA - config.js nunca chegou a carregar após ${MAX_INIT_ATTEMPTS} tentativas`);
    }
    return false;
  }

  if (typeof window.supabase === 'undefined') {
    console.warn(`${logMsg}: window.supabase não disponível (CDN não carregou?). Tentando novamente...`);
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      setTimeout(initializeSupabaseClient, INIT_RETRY_DELAY);
    } else {
      console.error(`${logMsg}: FALHA - @supabase/supabase-js nunca carregou após ${MAX_INIT_ATTEMPTS} tentativas. Problema com CDN?`);
    }
    return false;
  }

  try {
    const SUPABASE_URL = window.__SUPABASE_CONFIG__.SUPABASE_URL;
    const SUPABASE_ANON_KEY = window.__SUPABASE_CONFIG__.SUPABASE_ANON_KEY;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      console.error(`${logMsg}: FALHA - config.js está vazio (missing URL or KEY)`);
      return false;
    }

    console.log(`${logMsg}: Tentando criar cliente com URL:`, SUPABASE_URL.substring(0, 30) + '...');
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    if (!supabaseClient) {
      console.error(`${logMsg}: createClient retornou null/undefined`);
      if (initAttempts < MAX_INIT_ATTEMPTS) {
        setTimeout(initializeSupabaseClient, INIT_RETRY_DELAY);
      }
      return false;
    }

    window.supabaseClient = supabaseClient;
    console.log(`${logMsg}: ✅ SUCESSO - Cliente Supabase criado e exposto em window.supabaseClient`);
    return true;
  } catch (err) {
    console.error(`${logMsg}: Exceção ao criar cliente:`, err.message, err.stack);
    if (initAttempts < MAX_INIT_ATTEMPTS) {
      setTimeout(initializeSupabaseClient, INIT_RETRY_DELAY);
    }
    return false;
  }
}

// Começar imediatamente
console.log('[Auth] Iniciando Supabase client initialization immediately...');
initializeSupabaseClient();

class AuthManager {
  constructor() {
    this.session = this.loadSession();
  }

  loadSession() {
    const session = sessionStorage.getItem('sb_session');
    return session ? JSON.parse(session) : null;
  }

  saveSession(session) {
    if (session) {
      sessionStorage.setItem('sb_session', JSON.stringify(session));
      this.session = session;
    }
  }

  clearSession() {
    sessionStorage.removeItem('sb_session');
    this.session = null;
  }

  async isUserAuthorized() {
    if (!this.session?.user?.email) return false;
    await waitForSupabaseClient();
    if (!supabaseClient) {
      console.error('[Auth] ❌ supabaseClient não inicializado - não pode verificar autorização');
      return false;
    }
    try {
      const { data, error } = await supabaseClient
        .from('authorized_emails')
        .select('*')
        .eq('email', this.session.user.email)
        .eq('active', true)
        .single();
      return !error && data;
    } catch (err) {
      console.error('Error checking authorization:', err);
      return false;
    }
  }

  async requestOTP(email) {
    try {
      await waitForSupabaseClient();
      if (!supabaseClient) {
        console.error('[Auth] ❌ supabaseClient não inicializado - não pode solicitar OTP');
        throw new Error('Sistema de autenticação ainda não ficou disponível. Tenta novamente em alguns segundos.');
      }
      
      console.log('[Auth] Iniciando requestOTP para:', email);
      const { error } = await supabaseClient.auth.signInWithOtp({
        email: email.toLowerCase().trim()
      });
      if (error) {
        console.error('[Auth] Erro ao solicitar OTP:', error);
        if (String(error.message || '').toLowerCase().includes('rate limit')) {
          throw new Error('email rate limit exceeded');
        }
        throw error;
      }
      console.log('[Auth] OTP solicitado com sucesso');
      return { success: true };
    } catch (err) {
      console.error('[Auth] Exceção em requestOTP:', err);
      return { success: false, error: err.message };
    }
  }

  async verifyOTP(email, token) {
    try {
      await waitForSupabaseClient();
      if (!supabaseClient) {
        console.error('[Auth] ❌ supabaseClient não inicializado - não pode verificar OTP');
        throw new Error('Sistema de autenticação ainda não ficou disponível. Tenta novamente em alguns segundos.');
      }
      
      const { data, error } = await supabaseClient.auth.verifyOtp({
        email: email.toLowerCase().trim(),
        token,
        type: 'email'
      });
      if (error) throw error;

      this.saveSession(data.session);

      // Verificar se email está autorizado
      const authorized = await this.isUserAuthorized();
      if (!authorized) {
        await supabaseClient.auth.signOut();
        this.clearSession();
        throw new Error('Email não autorizado para aceder');
      }

      return { success: true };
    } catch (err) {
      console.error('[Auth] Erro ao verificar OTP:', err);
      return { success: false, error: err.message };
    }
  }

  getAccessToken() {
    return this.session?.access_token;
  }

  getUser() {
    return this.session?.user;
  }

  async logout() {
    await waitForSupabaseClient(2000);
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    this.clearSession();
  }
}

const authManager = new AuthManager();
window.authManager = authManager;
