import fs from 'fs';
import path from 'path';

const TOKEN = process.env.GITHUB_TOKEN || process.argv[2];
const REPO_NAME = process.env.REPO_NAME || process.argv[3] || 'sokoban-studio';

if (!TOKEN) {
  console.error('Error: Please provide your GitHub Token as an argument or GITHUB_TOKEN environment variable.');
  console.error('Usage: node scripts/github-deploy.mjs <YOUR_GITHUB_TOKEN> [REPO_NAME]');
  process.exit(1);
}

const API_BASE = 'https://api.github.com';
const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Accept': 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'Sokoban-Studio-Deployer'
};

async function ghFetch(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const errorMsg = data && data.message ? data.message : text;
    const err = new Error(`GitHub API Error (${res.status} ${res.statusText}): ${errorMsg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

export function getProjectFiles(dir, baseDir = dir) {
  const IGNORED = new Set([
    'node_modules',
    'dist',
    '.git',
    '.vscode',
    '.idea',
    'dist-ssr',
    'scratch'
  ]);

  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getProjectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      results.push({ relPath, fullPath });
    }
  }

  return results;
}

async function main() {
  console.log('🚀 开始自动化 GitHub 部署流程...\n');

  // 1. 验证用户身份
  console.log('1️⃣ 正在验证 GitHub Token 权限...');
  const user = await ghFetch('/user');
  console.log(`✅ 认证成功！当前登录账号: ${user.login} (${user.name || user.login})`);

  // 2. 检查或创建仓库
  console.log(`\n2️⃣ 正在配置 GitHub 仓库 [${REPO_NAME}]...`);
  let repo;
  try {
    repo = await ghFetch(`/repos/${user.login}/${REPO_NAME}`);
    console.log(`ℹ️ 仓库已存在: ${repo.html_url}`);
  } catch (err) {
    if (err.status === 404) {
      console.log(`✨ 正在新建公开仓库: ${REPO_NAME}...`);
      repo = await ghFetch('/user/repos', {
        method: 'POST',
        body: JSON.stringify({
          name: REPO_NAME,
          description: 'Sokoban Studio - Professional Web Sokoban Game with AI Solver & Auto Demo',
          homepage: `https://${user.login.toLowerCase()}.github.io/${REPO_NAME}/`,
          private: false,
          auto_init: false
        })
      });
      console.log(`✅ 仓库创建成功: ${repo.html_url}`);
    } else {
      throw err;
    }
  }

  // 2.5 检查仓库是否为空，若为空先通过 Contents API 初始化第一颗提交
  console.log('\n2.5 正在检查仓库分支初始化状态...');
  let parentSha = null;
  try {
    const ref = await ghFetch(`/repos/${user.login}/${REPO_NAME}/git/ref/heads/main`);
    parentSha = ref.object.sha;
    console.log(`ℹ️ main 分支已存在，当前 SHA: ${parentSha.slice(0, 7)}`);
  } catch (err) {
    console.log('🌱 仓库尚未初始化，正在通过 Contents API 写入首个基石提交 (README.md)...');
    const readmeContent = fs.readFileSync(path.join(process.cwd(), 'README.md'), 'utf-8');
    const initRes = await ghFetch(`/repos/${user.login}/${REPO_NAME}/contents/README.md`, {
      method: 'PUT',
      body: JSON.stringify({
        message: 'chore: initialize repository with README.md',
        content: Buffer.from(readmeContent).toString('base64'),
        branch: 'main'
      })
    });
    parentSha = initRes.commit.sha;
    console.log(`✅ 初始分支创建成功，SHA: ${parentSha.slice(0, 7)}`);
  }

  // 3. 收集本地文件并创建 Blobs
  const files = getProjectFiles(process.cwd());
  console.log(`\n3️⃣ 正在准备上传 ${files.length} 个核心项目文件至 Git Database...`);

  const treeItems = [];
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const contentBuffer = fs.readFileSync(file.fullPath);
    const base64Content = contentBuffer.toString('base64');

    process.stdout.write(`   [${i + 1}/${files.length}] 上传: ${file.relPath}... `);
    const blob = await ghFetch(`/repos/${user.login}/${REPO_NAME}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: base64Content,
        encoding: 'base64'
      })
    });
    console.log('✓');

    treeItems.push({
      path: file.relPath,
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    });
  }

  // 4. 创建 Git Tree
  console.log('\n4️⃣ 正在构建 Git Tree 结构...');
  const tree = await ghFetch(`/repos/${user.login}/${REPO_NAME}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      tree: treeItems
    })
  });
  console.log(`✅ Tree 构建完毕 (SHA: ${tree.sha.slice(0, 7)})`);

  // 5. 创建 Commit
  console.log('\n5️⃣ 正在创建发布提交 (Commit)...');
  const commitPayload = {
    message: 'feat: final polish, seamless 2.5D walls, smart hint & mobile gestures',
    tree: tree.sha,
    parents: parentSha ? [parentSha] : []
  };

  const commit = await ghFetch(`/repos/${user.login}/${REPO_NAME}/git/commits`, {
    method: 'POST',
    body: JSON.stringify(commitPayload)
  });
  console.log(`✅ Commit 提交成功 (SHA: ${commit.sha.slice(0, 7)})`);

  // 6. 更新 main 分支指针
  console.log('\n6️⃣ 正在更新 main 分支...');
  await ghFetch(`/repos/${user.login}/${REPO_NAME}/git/refs/heads/main`, {
    method: 'PATCH',
    body: JSON.stringify({
      sha: commit.sha,
      force: true
    })
  });
  console.log('✅ main 分支指针更新成功！');

  // 7. 配置 GitHub Pages
  console.log('\n7️⃣ 正在配置 GitHub Pages 部署源为 GitHub Actions...');
  try {
    await ghFetch(`/repos/${user.login}/${REPO_NAME}/pages`, {
      method: 'POST',
      body: JSON.stringify({
        build_type: 'workflow'
      })
    });
    console.log('✅ GitHub Pages 已成功启用 (Source: GitHub Actions)！');
  } catch (err) {
    if (err.status === 409 || err.status === 400 || (err.data && err.data.message?.includes('already exists'))) {
      try {
        await ghFetch(`/repos/${user.login}/${REPO_NAME}/pages`, {
          method: 'PUT',
          body: JSON.stringify({
            build_type: 'workflow'
          })
        });
        console.log('✅ GitHub Pages 部署源已更新为 GitHub Actions！');
      } catch (putErr) {
        console.log('ℹ️ GitHub Pages 已经处于激活状态。');
      }
    } else {
      console.warn(`⚠️ GitHub Pages 状态提示: ${err.message}`);
    }
  }

  const liveUrl = `https://${user.login.toLowerCase()}.github.io/${REPO_NAME}/`;
  console.log('\n========================================================================');
  console.log('🎉 代码推送与 GitHub Pages 配置全部完成！');
  console.log(`📦 仓库地址: ${repo.html_url}`);
  console.log(`🌐 游戏公网访问地址: ${liveUrl}`);
  console.log(`⚙️ GitHub Actions 运行状态: ${repo.html_url}/actions`);
  console.log('========================================================================\n');
}

main().catch(err => {
  console.error('\n❌ 部署失败:', err.message);
  process.exit(1);
});
