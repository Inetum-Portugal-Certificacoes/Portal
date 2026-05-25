(function () {
  'use strict';

  // Prevent duplicate loads when multiple pages include this file.
  if (window.__SUPABASE_LOADER_STARTED__) {
    return;
  }
  window.__SUPABASE_LOADER_STARTED__ = true;

  var attempts = 0;
  var timeoutId = null;
  var scriptSources = [
    '/Portal/assets/vendor/supabase.js',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://unpkg.com/@supabase/supabase-js@2',
    'https://esm.sh/@supabase/supabase-js@2'
  ];

  function finish(success, source) {
    clearTimeout(timeoutId);
    window.__SUPABASE_LOADER_DONE__ = true;
    window.__SUPABASE_LOADER_OK__ = success;
    window.__SUPABASE_LOADER_SOURCE__ = source || null;

    if (success) {
      console.log('[SUPABASE] Biblioteca carregada de:', source);
    } else {
      console.error('[SUPABASE] Falha ao carregar biblioteca Supabase de todas as fontes');
    }
  }

  function loadNext() {
    if (typeof window.supabase !== 'undefined') {
      finish(true, scriptSources[Math.max(0, attempts - 1)] || 'already-present');
      return;
    }

    if (attempts >= scriptSources.length) {
      finish(false, null);
      return;
    }

    var src = scriptSources[attempts++];
    var script = document.createElement('script');
    script.src = src;
    script.async = true;

    script.onload = function () {
      if (typeof window.supabase !== 'undefined') {
        finish(true, src);
      } else {
        console.warn('[SUPABASE] Script carregou mas window.supabase não existe. A tentar próxima fonte...');
        loadNext();
      }
    };

    script.onerror = function () {
      console.warn('[SUPABASE] Falha ao carregar de ' + src + '. A tentar próxima fonte...');
      clearTimeout(timeoutId);
      loadNext();
    };

    timeoutId = setTimeout(function () {
      console.warn('[SUPABASE] Timeout ao carregar de ' + src + '. A tentar próxima fonte...');
      loadNext();
    }, 5000);

    document.head.appendChild(script);
  }

  loadNext();
})();
