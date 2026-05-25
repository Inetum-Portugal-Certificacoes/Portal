// Autenticação OTP com Supabase
// Configuração carregada de window.__SUPABASE_CONFIG__ (injetado no HTML)
if (!window.__SUPABASE_CONFIG__) {
  console.error('Supabase config not loaded. Please ensure config is injected before auth.js');
}

const SUPABASE_URL = window.__SUPABASE_CONFIG__?.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.__SUPABASE_CONFIG__?.SUPABASE_ANON_KEY || '';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
      const { error } = await supabaseClient.auth.signInWithOtp({
        email: email.toLowerCase().trim()
      });
      if (error) throw error;
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  async verifyOTP(email, token) {
    try {
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
    await supabaseClient.auth.signOut();
    this.clearSession();
  }
}

const authManager = new AuthManager();
