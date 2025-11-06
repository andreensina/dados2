// api/get-files.js - mesma forma, apontando para o repo e corrigindo encoding

export default async function handler(req, res) {
  // Configurações (só altere aqui se trocar de repo)
  const GITHUB_USER = "andreensina";
  const GITHUB_REPO = "dados";        // ou "Repositorio" se quiser usar o outro
  const GITHUB_PATH = "";             // Raiz do repositório

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return res.status(500).json({
      error: "Token do GitHub não configurado. Configure GITHUB_TOKEN nas variáveis de ambiente."
    });
  }

  // Extensões permitidas (mantido)
  const videoExt = ["mp4", "webm", "mov", "avi", "mkv"];
  const imageExt = ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp"];
  const allowedExt = [...videoExt, ...imageExt];

  // Helpers
  const gh = (path, init = {}) =>
    fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "Repox-App",
        ...(init.headers || {})
      }
    });

  // monta URL de /contents, codificando cada segmento do path
  const contentsURL = (path, branch) => {
    const safe = (path || "")
      .split("/")
      .filter(Boolean)
      .map(s => encodeURIComponent(s))
      .join("/");
    const base = `/repos/${GITHUB_USER}/${GITHUB_REPO}/contents/${safe}`;
    return branch ? `${base}?ref=${encodeURIComponent(branch)}` : base;
  };

  try {
    console.log("🔍 Buscando default_branch do repositório...");
    const repoResp = await gh(`/repos/${GITHUB_USER}/${GITHUB_REPO}`);
    if (!repoResp.ok) {
      const body = await repoResp.text();
      throw new Error(`Erro do GitHub (${repoResp.status}) ao ler /repos: ${body}`);
    }
    const repoJson = await repoResp.json();
    const defaultBranch = repoJson.default_branch || "main";

    console.log("🔍 Buscando estrutura do repositório (branch:", defaultBranch, ")...");

    // Busca recursiva em /contents com path encodado
    async function fetchAllFiles(path = "") {
      const url = contentsURL(path, defaultBranch);
      const response = await gh(url);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Erro do GitHub:", response.status, errorText);
        let hint = "Confirme owner/repo/path e permissões do token.";
        if (response.status === 404) {
          hint = `Conteúdo não encontrado. Confira se o caminho "${path || "/"}" existe na branch "${defaultBranch}".`;
        } else if (response.status === 403) {
          hint = "Acesso negado. Verifique o escopo do GITHUB_TOKEN (repo p/ privados) e rate limits.";
        }
        throw new Error(`Erro do GitHub (${response.status}): ${response.statusText}. ${hint}`);
      }

      const items = await response.json();
      if (!Array.isArray(items)) {
        throw new Error("Resposta inesperada da API do GitHub (esperado array do /contents).");
      }

      let allFiles = [];
      for (const item of items) {
        // defensivo: tira espaços invisíveis no fim do path
        const cleanPath = (item.path || "").trim();

        if (item.type === "file") {
          const ext = (item.name.split(".").pop() || "").toLowerCase();
          if (allowedExt.includes(ext)) {
            // forçamos o path “limpo” no objeto (só se precisar usar depois)
            allFiles.push({ ...item, path: cleanPath });
          }
        } else if (item.type === "dir") {
          console.log(`📁 Explorando pasta: ${cleanPath}`);
          const subFiles = await fetchAllFiles(cleanPath);
          allFiles = allFiles.concat(subFiles);
        }
      }
      return allFiles;
    }

    // Buscar todos os arquivos a partir da raiz (mantido)
    const files = await fetchAllFiles(GITHUB_PATH);
    console.log(`Total de arquivos encontrados: ${files.length}`);

    // Montagem do ARRAY de mídia (mantido)
    const mediaFiles = files.map((file) => {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      const type = videoExt.includes(ext) ? "video" : "image";

      // perfil = primeira pasta; raiz => "unknown" (mantido)
      const pathParts = (file.path || "").split("/");
      const profileName = pathParts.length > 1 ? pathParts[0] : "unknown";

      return {
        id: file.sha,
        type,
        url: file.download_url,                       // link raw do GitHub
        title: file.name.replace(/\.[^.]+$/, ""),     // nome sem extensão
        name: file.name,
        path: file.path,
        profile: profileName,
        date: new Date().toISOString().split("T")[0], // se quiser, troque por commit date
        size: file.size
      };
    });

    console.log(`Arquivos de mídia válidos: ${mediaFiles.length}`);

    // Cache
    res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate");
    res.setHeader("Content-Type", "application/json");
    return res.status(200).json(mediaFiles);

  } catch (error) {
    console.error("❌ Erro ao buscar arquivos:", error);
    return res.status(500).json({
      error: error.message,
      details: "Verifique GITHUB_TOKEN e se o repositório/branch/caminho existem e estão acessíveis para esse token."
    });
  }
}
