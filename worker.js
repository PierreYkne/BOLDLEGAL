// Cloudflare Worker — proxy vers Anthropic API
// Déployez ce fichier sur workers.cloudflare.com

const ANTHROPIC_KEY = 'REMPLACER_PAR_VOTRE_CLE_SK_ANT';

const PROMPT = `Tu es expert juridique contrats d'influence France. Intérêt prioritaire : AGENCE.
Standards BOLD/TDP : paiement max 30j + pénalités, pas droits moraux, licence limitée + interdiction IA, exclusivité rémunérée + concurrents listés, responsabilité Agence plafonnée + dommages indirects exclus, résiliation après mise en demeure 15j, confidentialité mutuelle 3ans, droit français + Paris, RGPD, force majeure Art.1218.
Retourne UNIQUEMENT ce JSON valide sans backticks :
{"parties":{"agence":"","talent":"","client":""},"objet":"","campagne":null,"budget":null,"duree":null,"score":"élevé|modéré|faible","resume":"2 phrases","clauses":[{"id":1,"titre":"","article":"Art.X ou Absent","statut":"risque|attention|ok","resume_sales":"1 phrase simple","detail_legal":"analyse complète","texte_original":"extrait ou null","correction":"version corrigée ou null"}],"absentes":[],"negocier":[]}`;

export default {
  async fetch(request) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    const { contractText } = await request.json();

    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 6000,
        stream: true,
        system: PROMPT,
        messages: [{ role: 'user', content: `Analyse ce contrat et retourne le JSON :\n\n${contractText.substring(0, 8000)}` }]
      })
    });

    // Transformer le stream SSE en texte brut
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const reader = upstream.body.getReader();
    const dec = new TextDecoder();
    const enc = new TextEncoder();

    (async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = dec.decode(value, { stream: true });
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data:')) continue;
            const d = line.slice(5).trim();
            if (d === '[DONE]') continue;
            try {
              const j = JSON.parse(d);
              const t = j.delta?.text || '';
              if (t) await writer.write(enc.encode(t));
            } catch {}
          }
        }
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache',
      }
    });
  }
};
