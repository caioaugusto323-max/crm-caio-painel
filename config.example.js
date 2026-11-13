// Copie este arquivo para config.js e preencha com os dados do projeto Supabase.
// config.js é gitignored. A publishable key pode ficar no cliente (é pública),
// mas evitamos versionar por higiene.
window.CRM_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "sb_publishable_SUA_CHAVE",

  // Marca do cliente (white label). Se omitir o bloco todo, usa o padrão do Caio.
  marca: {
    nome: "Escritório Exemplo",   // nome que aparece no painel
    sub: "Advocacia",             // linha de baixo (segmento)
    sigla: "EE",                  // iniciais no selo quando NÃO há logo
    logo: "",                     // nome do arquivo do logo (ex: "logo-silva.png"); vazio = usa a sigla
    cor: "#1F3A5F"                // cor principal (azul-marinho por padrão)
  }
};
