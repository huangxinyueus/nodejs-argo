#!/usr/bin/env node

const http = require("http");
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const crypto = require('crypto');
const { promisify } = require('util');
const { exec: execCommand, execSync } = require('child_process');
const exec = promisify(execCommand);

const UPLOAD_URL = process.env.UPLOAD_URL || '';      // 节点或订阅自动上传地址，需填写部署Merge-sub项目后的首页地址，例如：https://merge.xxx.com
const PROJECT_URL = process.env.PROJECT_URL || '';    // 需要上传订阅或保活时需填写项目分配的url，例如：https://google.com
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; // false关闭自动保活，true开启，需同时填写PROJECT_URL变量
const FILE_PATH = process.env.FILE_PATH || '.npm';    // 运行目录,sub节点文件保存目录
const SUB_PATH = process.env.SUB_PATH || 'sub';       // 订阅路径
const PORT = process.env.SERVER_PORT || process.env.PORT || 3000;        // http服务订阅端口
const UUID = process.env.UUID || 'afe8a6c2-7f81-4a15-bebc-b555cb7c9a52'; // 使用哪吒v1,在不同的平台运行需修改UUID,否则会覆盖
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nezha.keai.pp.ua:443';        // 哪吒v1填写形式: nz.abc.com:8008 哪吒v0填写形式: nz.abc.com
const NEZHA_PORT = process.env.NEZHA_PORT || '';            // 使用哪吒v1请留空，哪吒v0需填写
const NEZHA_KEY = process.env.NEZHA_KEY || '78dvbmjB34Fe5xhlxJP8iIGjkgLUnOvH';              // 哪吒v1的NZ_CLIENT_SECRET或哪吒v0的agent密钥
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '187railway.keaiduo.kdns.fr';          // 固定隧道域名，留空即启用临时隧道
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYjA2ZWRhZjA4NTVkMWQ1NTE3MzUwMTRjYzI5YTA3YjgiLCJ0IjoiMzllNDBjYWQtZjk0ZS00Zjg1LWI4NGMtOTFlYjFmYTZiYjRlIiwicyI6IllUbGhZakF5WTJRdFlqTm1PQzAwWkdReExXRXlZMk10TXpZeVltUXlNemt3WTJZMCJ9';              // 留空即启用临时隧道,json获取地址: https://json.zone.id
const ARGO_PORT = process.env.ARGO_PORT || 8001;            // 固定隧道端口,使用token需在cloudflare后台设置和这里一致
const S5_PORT = process.env.S5_PORT || '';                  // socks5 端口
const HY2_PORT = process.env.HY2_PORT || '20038,30100:30200';                // hysteria2 端口 (留空则随机单端口，支持自定义主端口或主端口,跳跃范围，如 3000,2000:2100)
const TUIC_PORT = process.env.TUIC_PORT || '43238,23200:23300';              // tuic 端口 (留空则随机单端口，支持自定义主端口或主端口,跳跃范围，如 3000,2000:2100)
const REALITY_PORT = process.env.REALITY_PORT || '';        // reality 端口 (留空则随机单端口，支持自定义主端口或主端口，如 3000,2000:2100)
const CFIP = process.env.CFIP || 'youxuan.yuyu2012.nyc.mn';            // 节点优选域名或优选ip
const CFPORT = process.env.CFPORT || 443;                   // 节点优选域名或优选ip对应的端口
const NAME = process.env.NAME || '187railway-u';                        // 节点名称
const CHAT_ID = process.env.CHAT_ID || '';                  // Telegram机器人chat_id
const BOT_TOKEN = process.env.BOT_TOKEN || '';              // Telegram机器人token
const SHOW_LOG = !['false', 'disable', 'no'].includes((process.env.SHOW_LOG || 'true').toLowerCase()); 

const XHTTP_VAL = (process.env.XHTTP_ENABLE || process.env.ENABLE_XHTTP || process.env.XHTTP_PORT || '').trim();

if (!SHOW_LOG) {
  console.log = () => {};
  console.error = () => {};
}
function alwaysLog(msg) {
  process.stdout.write(msg + '\n');
}

if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
}

const usedPortsSet = new Set([3001, 3002, 3003, 3004, parseInt(ARGO_PORT, 10)]);

function generateUniqueRandomPort(min = 10000, max = 60000) {
  let randomPort;
  do {
    randomPort = Math.floor(Math.random() * (max - min + 1)) + min;
  } while (usedPortsSet.has(randomPort));
  usedPortsSet.add(randomPort);
  return randomPort;
}

function isValidPort(port) {
  try {
    if (port === null || port === undefined || port === '') return false;
    if (typeof port === 'string' && port.trim() === '') return false;
    const str = String(port).trim();
    if (/^[0-9]+$/.test(str)) {
      const portNum = parseInt(str, 10);
      return portNum >= 1 && portNum <= 65535;
    }
    // 支持 主端口,跳跃范围 格式，如 3000,2000:2100 或 3000,2000-2100
    if (/^[0-9]+\s*,\s*[0-9]+[\-:][0-9]+$/.test(str)) {
      const parts = str.split(',').map(p => p.trim());
      const main = parseInt(parts[0], 10);
      const subParts = parts[1].split(/[\-:]/);
      const start = parseInt(subParts[0], 10);
      const end = parseInt(subParts[1], 10);
      return main >= 1 && main <= 65535 && start >= 1 && start <= 65535 && end >= 1 && end <= 65535 && start <= end;
    }
    if (/^[0-9]+[\-:][0-9]+$/.test(str)) {
      const parts = str.split(/[\-:]/);
      const start = parseInt(parts[0], 10);
      const end = parseInt(parts[1], 10);
      return start >= 1 && start <= 65535 && end >= 1 && end <= 65535 && start <= end;
    }
    if (str.includes(',')) {
      const parts = str.split(',');
      return parts.every(p => isValidPort(p.trim()));
    }
    return false;
  } catch (error) {
    return false;
  }
}

function parsePortConfig(portStr, allowAutoRandom = false) {
  const isPortValid = isValidPort(portStr);
  
  if (!isPortValid && !allowAutoRandom) {
    return null;
  }

  if (!isPortValid && allowAutoRandom) {
    const randomPort = generateUniqueRandomPort();
    return { mainPort: randomPort, subPortParam: `${randomPort}` };
  }

  const str = String(portStr).trim();
  let mainPort = 0;
  let subPortParam = '';

  if (/^[0-9]+$/.test(str)) {
    mainPort = parseInt(str, 10);
    subPortParam = `${mainPort}`;
  } else if (/^[0-9]+\s*,\s*[0-9]+[\-:][0-9]+$/.test(str)) {
    const parts = str.split(',').map(p => p.trim());
    mainPort = parseInt(parts[0], 10);
    subPortParam = parts[1].replace(/:/g, '-');
  } else if (/^[0-9]+[\-:][0-9]+$/.test(str)) {
    const parts = str.split(/[\-:]/);
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    mainPort = start;
    subPortParam = `${start}-${end}`;
  } else if (str.includes(',')) {
    const parts = str.split(',').map(p => p.trim());
    mainPort = parseInt(parts[0], 10);
    subPortParam = str.replace(/^[^,]+,\s*/, '').replace(/:/g, '-');
  }

  usedPortsSet.add(mainPort);
  return { mainPort, subPortParam };
}

function parseXhttpConfig() {
  const val = XHTTP_VAL.toLowerCase();
  if (['n', 'false', '0', 'no', 'disable'].includes(val)) {
    return null;
  }
  
  if (isValidPort(XHTTP_VAL)) {
    const p = parseInt(XHTTP_VAL, 10);
    usedPortsSet.add(p);
    return { port: p, enabled: true };
  }
  
  const randomPort = generateUniqueRandomPort();
  return { port: randomPort, enabled: true };
}

const xhttpConfig = parseXhttpConfig();

function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

let subContent = null;
let privateKey = '';
let publicKey = '';
const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName);
let phpPath = path.join(FILE_PATH, phpName);
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath1 = path.join(FILE_PATH, 'boot.log.1');
let bootLogPath2 = path.join(FILE_PATH, 'boot.log.2');
let bootLogPath3 = path.join(FILE_PATH, 'boot.log.3');
let configPath = path.join(FILE_PATH, 'config.json');
let certPath = path.resolve(FILE_PATH, 'cert.pem');
let keyPath = path.resolve(FILE_PATH, 'private.key');

function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;

    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch {
      return null;
    }

    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line =>
      /(vless|vmess|trojan|hysteria2|tuic|socks):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    axios.post(`${UPLOAD_URL}/api/delete-nodes`,
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch((error) => {
      return null;
    });
    return null;
  } catch (err) {
    return null;
  }
}

function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {}
    });
  } catch (err) {}
}

function generateX25519Keypair() {
  const { publicKey: pubKey, privateKey: privKey } = crypto.generateKeyPairSync('x25519');
  const privateKeyRaw = privKey.export({ type: 'pkcs8', format: 'der' }).subarray(-32);
  const publicKeyRaw = pubKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  return {
    privateKey: privateKeyRaw.toString('base64url'),
    publicKey: publicKeyRaw.toString('base64url')
  };
}

function generateOrLoadKeyPair() {
  const keyFilePath = path.join(FILE_PATH, 'key.txt');
  if (fs.existsSync(keyFilePath)) {
    const content = fs.readFileSync(keyFilePath, 'utf8');
    const privateKeyMatch = content.match(/PrivateKey:\s*(.*)/);
    const publicKeyMatch = content.match(/PublicKey:\s*(.*)/);
    if (privateKeyMatch && publicKeyMatch) {
      privateKey = privateKeyMatch[1].trim();
      publicKey = publicKeyMatch[1].trim();
      return;
    }
  }
  const keypair = generateX25519Keypair();
  privateKey = keypair.privateKey;
  publicKey = keypair.publicKey;
  fs.writeFileSync(keyFilePath, `PrivateKey: ${privateKey}\nPublicKey: ${publicKey}\n`, 'utf8');
}

const FALLBACK_EC_KEY =
  '-----BEGIN EC PARAMETERS-----\n' +
  'BggqhkjOPQMBBw==\n' +
  '-----END EC PARAMETERS-----\n' +
  '-----BEGIN EC PRIVATE KEY-----\n' +
  'MHcCAQEEIM4792SEtPqIt1ywqTd/0bYidBqpYV/++siNnfBYsdUYoAoGCCqGSM49\n' +
  'AwEHoUQDQgAE1kHafPj07rJG+HboH2ekAI4r+e6TL38GWASANnngZreoQDF16ARa\n' +
  '/TsyLyFoPkhLxSbehH/NBEjHtSZGaDhMqQ==\n' +
  '-----END EC PRIVATE KEY-----\n';

const FALLBACK_CERT =
  '-----BEGIN CERTIFICATE-----\n' +
  'MIIBejCCASGgAwIBAgIUfWeQL3556PNJLp/veCFxGNj9crkwCgYIKoZIzj0EAwIw\n' +
  'EzERMA8GA1UEAwwIYmluZy5jb20wHhcNMjUwOTE4MTgyMDIyWhcNMzUwOTE2MTgy\n' +
  'MDIyWjATMREwDwYDVQQDDAhiaW5nLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEH\n' +
  'A0IABNZB2nz49O6yRvh26B9npACOK/nuky9/BlgEgDZ54Ga3qEAxdegEWv07Mi8h\n' +
  'aD5IS8Um3oR/zQRIx7UmRmg4TKmjUzBRMB0GA1UdDgQWBBTV1cFID7UISE7PLTBR\n' +
  'BfGbgkrMNzAfBgNVHSMEGDAWgBTV1cFID7UISE7PLTBRBfGbgkrMNzAPBgNVHRMB\n' +
  'Af8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIAIDAJvg0vd/ytrQVvEcSm6XTlB+\n' +
  'eQ6OFb9LbLYL9f+sAiAffoMbi4y/0YUSlTtz7as9S8/lciBF5VCUoVIKS+vX2g==\n' +
  '-----END CERTIFICATE-----\n';

function ensureTlsCertificates(certPath, keyPath) {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return;
  fs.mkdirSync(path.dirname(certPath), { recursive: true });
  try {
    execSync('openssl version', { stdio: 'ignore' });
    execSync(`openssl ecparam -genkey -name prime256v1 -out "${keyPath}"`, { stdio: 'ignore' });
    execSync(`openssl req -new -x509 -days 3650 -key "${keyPath}" -out "${certPath}" -subj "/CN=bing.com"`, { stdio: 'ignore' });
    return;
  } catch (e) {}
  fs.writeFileSync(keyPath, FALLBACK_EC_KEY);
  fs.writeFileSync(certPath, FALLBACK_CERT);
}

function getCertificateFingerprint(certPath) {
  try {
    const result = execSync(
      `openssl x509 -noout -fingerprint -sha256 -in "${certPath}"`,
      { encoding: 'utf8', timeout: 3000 }
    ).trim();
    const match = result.match(/=(.+)$/);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
  } catch (e) {}

  try {
    const certData = fs.readFileSync(certPath, 'utf8');
    const derMatch = certData.match(/-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----/);
    if (!derMatch) return '';
    const derBase64 = derMatch[1].replace(/\s/g, '');
    const derBuffer = Buffer.from(derBase64, 'base64');
    const hash = crypto.createHash('sha256').update(derBuffer).digest('hex');
    return hash.match(/.{2}/g).join(':').toUpperCase();
  } catch (error) {
    return '';
  }
}

async function generateConfig() {
  const fallbacksList = [
    { dest: 3001 }, 
    { path: "/vless-argo", dest: 3002 }, 
    { path: "/vmess-argo", dest: 3003 }, 
    { path: "/trojan-argo", dest: 3004 }
  ];

  if (xhttpConfig && xhttpConfig.enabled) {
    fallbacksList.push({ path: "/vless-xhttp", dest: xhttpConfig.port });
  }

  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { 
        tag: 'vless-fallback-in', 
        port: ARGO_PORT, 
        listen: '::', 
        protocol: 'vless', 
        settings: { 
          clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], 
          decryption: 'none', 
          fallbacks: fallbacksList
        }, 
        streamSettings: { network: 'tcp' } 
      },
      { tag: 'vless-tcp-in', port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { tag: 'vless-ws-in', port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { tag: 'vmess-ws-in', port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { tag: 'trojan-ws-in', port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } }
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [{ protocol: "freedom", tag: "direct" }, { protocol: "blackhole", tag: "block" }]
  };

  if (xhttpConfig && xhttpConfig.enabled) {
    config.inbounds.push({
      tag: 'vless-xhttp-in',
      port: xhttpConfig.port,
      listen: "127.0.0.1",
      protocol: "vless",
      settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" },
      streamSettings: { network: "xhttp", security: "none", xhttpSettings: { path: "/vless-xhttp", mode: "auto" } },
      sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false }
    });
  }

  const realityConfig = parsePortConfig(REALITY_PORT, true);
  if (realityConfig) {
    config.inbounds.push({
      tag: "vless-in",
      listen: "::",
      port: realityConfig.mainPort,
      protocol: "vless",
      settings: {
        clients: [{ id: UUID, flow: "xtls-rprx-vision" }],
        decryption: "none"
      },
      streamSettings: {
        network: "raw",
        security: "reality",
        realitySettings: {
          show: false,
          dest: "www.iij.ad.jp:443",
          xver: 0,
          serverNames: ["www.iij.ad.jp"],
          privateKey: privateKey,
          shortIds: [""]
        }
      }
    });
  }

  const hy2Config = parsePortConfig(HY2_PORT, true);
  if (hy2Config) {
    config.inbounds.push({
      tag: "hysteria-in",
      listen: "::",
      port: hy2Config.mainPort,
      protocol: "hysteria",
      settings: {
        version: 2,
        clients: [{ auth: UUID }]
      },
      streamSettings: {
        network: "hysteria",
        hysteriaSettings: {
          version: 2,
          masquerade: {
            type: "proxy",
            url: "https://bing.com"
          }
        },
        security: "tls",
        tlsSettings: {
          alpn: ["h3"],
          certificates: [
            {
              certificateFile: certPath,
              keyFile: keyPath
            }
          ]
        }
      }
    });
  }

  const tuicConfig = parsePortConfig(TUIC_PORT, true);
  if (tuicConfig) {
    config.inbounds.push({
      tag: "tuic-in",
      listen: "::",
      port: tuicConfig.mainPort,
      protocol: "tuic",
      settings: {
        users: [{ uuid: UUID, password: UUID }],
        congestion_control: "bbr",
        zero_rtt_handshake: true
      },
      streamSettings: {
        network: "tuic",
        security: "tls",
        tlsSettings: {
          alpn: ["h3"],
          certificates: [
            {
              certificateFile: certPath,
              keyFile: keyPath
            }
          ]
        }
      }
    });
  }

  const s5Config = parsePortConfig(S5_PORT, true);
  if (s5Config) {
    config.inbounds.push({
      tag: "s5-in",
      listen: "::",
      port: s5Config.mainPort,
      protocol: "socks",
      settings: {
        auth: "password",
        accounts: [
          {
            user: UUID.substring(0, 8),
            pass: UUID.slice(-12)
          }
        ],
        udp: true
      }
    });
  }

  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

function downloadFile(fileName, fileUrl, callback) {
  const filePath = fileName;
  const tempFilePath = `${filePath}.download`;

  if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH, { recursive: true });
  }

  const writer = fs.createWriteStream(tempFilePath);

  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close((closeError) => {
          if (closeError) {
            fs.unlink(tempFilePath, () => { });
            callback(closeError.message);
            return;
          }
          try {
            fs.renameSync(tempFilePath, filePath);
          } catch (renameError) {
            fs.unlink(tempFilePath, () => { });
            callback(renameError.message);
            return;
          }
          callback(null, filePath);
        });
      });

      writer.on('error', err => {
        fs.unlink(tempFilePath, () => { });
        callback(err.message);
      });
    })
    .catch(err => {
      fs.unlink(tempFilePath, () => { });
      callback(err.message);
    });
}

async function downloadFilesAndRun() {
  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) return;

  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      const tryDownload = (urlIndex) => {
        downloadFile(fileInfo.fileName, fileInfo.fileUrls[urlIndex], (err, filePath) => {
          if (!err) {
            resolve(filePath);
            return;
          }
          if (urlIndex + 1 < fileInfo.fileUrls.length) {
            tryDownload(urlIndex + 1);
            return;
          }
          reject(err);
        });
      };
      tryDownload(0);
    });
  });

  try {
    await Promise.all(downloadPromises);
  } catch (err) {
    return;
  }

  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(absoluteFilePath => {
      if (fs.existsSync(absoluteFilePath)) {
        try {
          fs.chmodSync(absoluteFilePath, newPermissions);
        } catch (err) {}
      }
    });
  }
  const filesToAuthorize = NEZHA_PORT ? [npmPath, webPath, botPath] : [phpPath, webPath, botPath];
  authorizeFiles(filesToAuthorize);

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${NEZHA_SERVER}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;

      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
      try {
        await exec(`nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {}
    } else {
      let NEZHA_TLS = '';
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      if (tlsPorts.includes(NEZHA_PORT)) {
        NEZHA_TLS = '--tls';
      }
      try {
        await exec(`nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {}
    }
  }

  try {
    await exec(`nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {}

  if (fs.existsSync(botPath)) {
    if (ARGO_AUTH && ARGO_DOMAIN) {
      let args;
      if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
        args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
      } else if (ARGO_AUTH.match(/TunnelSecret/)) {
        args = `tunnel --edge-ip-version auto --config "${path.resolve(FILE_PATH, 'tunnel.yml')}" run`;
      }
      if (args) {
        try {
          await exec(`nohup "${path.resolve(botPath)}" ${args} >/dev/null 2>&1 &`);
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {}
      }
    }

    const bootLogs = [bootLogPath1, bootLogPath2, bootLogPath3];
    for (let i = 0; i < bootLogs.length; i++) {
      const logPath = bootLogs[i];
      const tempArgs = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile "${path.resolve(logPath)}" --loglevel info --url http://localhost:${ARGO_PORT}`;
      try {
        await exec(`nohup "${path.resolve(botPath)}" ${tempArgs} >/dev/null 2>&1 &`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {}
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

function getFilesForArchitecture(architecture) {
  const baseUrl = architecture === 'arm' ? 'https://arm64.oooen.com' : 'https://amd64.oooen.com';
  const backupUrl = architecture === 'arm' ? 'https://arm64.ssss.nyc.mn' : 'https://amd64.ssss.nyc.mn';
  const baseFiles = [
    { fileName: webPath, fileUrls: [`${baseUrl}/web`, `${backupUrl}/web`] },
    { fileName: botPath, fileUrls: [`${baseUrl}/bot`, `${backupUrl}/bot`] }
  ];

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      baseFiles.unshift({
        fileName: npmPath,
        fileUrls: [`${baseUrl}/agent`, `${backupUrl}/agent`]
      });
    } else {
      baseFiles.unshift({
        fileName: phpPath,
        fileUrls: [`${baseUrl}/v1`, `${backupUrl}/v1`]
      });
    }
  }

  return baseFiles;
}

function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) return;

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
  tunnel: ${ARGO_AUTH.split('"')[11]}
  credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
  protocol: http2
  
  ingress:
    - hostname: ${ARGO_DOMAIN}
      service: http://localhost:${ARGO_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  }
}

async function waitForQuickTunnelLog(logPath, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (fs.existsSync(logPath)) {
        const content = fs.readFileSync(logPath, 'utf-8');
        if (/trycloudflare\.com/.test(content)) return content;
      }
    } catch (error) {}
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return '';
}

async function extractDomains() {
  const quickDomains = [];
  const bootLogs = [bootLogPath1, bootLogPath2, bootLogPath3];

  for (let i = 0; i < bootLogs.length; i++) {
    const logPath = bootLogs[i];
    try {
      const fileContent = await waitForQuickTunnelLog(logPath);
      const lines = fileContent.split('\n');
      let foundDomain = '';
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) {
          foundDomain = domainMatch[1];
        }
      });
      if (foundDomain) quickDomains.push(foundDomain);
    } catch (error) {}
  }

  const fixedDomain = (ARGO_AUTH && ARGO_DOMAIN) ? ARGO_DOMAIN : '';
  await generateLinks(fixedDomain, quickDomains);
}

async function getMetaInfo() {
  try {
    const response1 = await axios.get('https://api.ip.sb/geoip', { headers: { 'User-Agent': 'Mozilla/5.0', timeout: 3000 } });
    if (response1.data && response1.data.country_code && response1.data.isp) {
      return `${response1.data.country_code}-${response1.data.isp}`.replace(/\s+/g, '_');
    }
  } catch (error) {
    try {
      const response2 = await axios.get('http://ip-api.com/json', { headers: { 'User-Agent': 'Mozilla/5.0', timeout: 3000 } });
      if (response2.data && response2.data.status === 'success' && response2.data.countryCode && response2.data.org) {
        return `${response2.data.countryCode}-${response2.data.org}`.replace(/\s+/g, '_');
      }
    } catch (error) {}
  }
  return 'Unknown';
}

async function getServerIP() {
  let serverIP = '';
  try {
    const ipv4Response = await axios.get('http://ipv4.ip.sb', { timeout: 3000 });
    serverIP = ipv4Response.data.trim();
  } catch (err) {
    try {
      serverIP = execSync('curl -sm 3 ipv4.ip.sb').toString().trim();
    } catch (curlErr) {
      try {
        const ipv6Response = await axios.get('http://ipv6.ip.sb', { timeout: 3000 });
        serverIP = `[${ipv6Response.data.trim()}]`;
      } catch (ipv6AxiosErr) {
        try {
          serverIP = `[${execSync('curl -sm 3 ipv6.ip.sb').toString().trim()}]`;
        } catch (ipv6CurlErr) {}
      }
    }
  }
  return serverIP;
}

async function generateLinks(fixedDomain, quickDomains = []) {
  const ISP = await getMetaInfo();
  const baseNodeName = NAME ? `${NAME}-${ISP}` : ISP;
  const SERVER_IP = await getServerIP();

  return new Promise((resolve) => {
    setTimeout(() => {
      let subTxt = '';

      function appendTunnelNodes(domain, tag) {
        const nameSuffix = tag ? `-${tag}` : '';
        const nodeName = `${baseNodeName}${nameSuffix}`;
        const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: domain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: domain, alpn: '', fp: 'firefox' };
        
        subTxt += `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${domain}&fp=firefox&type=ws&host=${domain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}\n\n`;
        subTxt += `vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}\n\n`;
        subTxt += `trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${domain}&fp=firefox&type=ws&host=${domain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}\n\n`;
        
        if (xhttpConfig && xhttpConfig.enabled) {
          subTxt += `vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${domain}&fp=firefox&type=xhttp&host=${domain}&path=%2Fvless-xhttp&mode=auto#${nodeName}-xhttp\n\n`;
        }
      }

      if (fixedDomain) {
        appendTunnelNodes(fixedDomain, 'Fixed');
      }

      quickDomains.forEach((domain, idx) => {
        appendTunnelNodes(domain, `Argo${idx + 1}`);
      });

      const hy2Config = parsePortConfig(HY2_PORT, true);
      if (hy2Config) {
        const fingerprint = getCertificateFingerprint(certPath);
        const fingerprintParam = fingerprint ? `&pinSHA256=${encodeURIComponent(fingerprint)}` : '';
        const hysteriaNode = `hysteria2://${UUID}@${SERVER_IP}:${hy2Config.subPortParam}/?sni=www.bing.com&insecure=0&alpn=h3&obfs=none${fingerprintParam}#${baseNodeName}\n\n`;
        subTxt += hysteriaNode;
      }

      const tuicConfig = parsePortConfig(TUIC_PORT, true);
      if (tuicConfig) {
        const tuicNode = `tuic://${UUID}:${UUID}@${SERVER_IP}:${tuicConfig.subPortParam}/?sni=www.bing.com&alpn=h3&congestion_control=bbr&udp_relay_mode=native#${baseNodeName}\n\n`;
        subTxt += tuicNode;
      }

      const realityConfig = parsePortConfig(REALITY_PORT, true);
      if (realityConfig) {
        const vlessNode = `vless://${UUID}@${SERVER_IP}:${realityConfig.subPortParam}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.iij.ad.jp&fp=firefox&pbk=${publicKey}&type=tcp&headerType=none#${baseNodeName}\n\n`;
        subTxt += vlessNode;
      }

      const s5Config = parsePortConfig(S5_PORT, true);
      if (s5Config) {
        const S5_AUTH = Buffer.from(`${UUID.substring(0, 8)}:${UUID.slice(-12)}`).toString('base64');
        const s5Node = `socks://${S5_AUTH}@${SERVER_IP}:${s5Config.subPortParam}#${baseNodeName}\n\n`;
        subTxt += s5Node;
      }

      subTxt = subTxt.trim();

      fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
      fs.writeFileSync(listPath, subTxt, 'utf8');
      subContent = Buffer.from(subTxt).toString('base64');
      uploadNodes();
      resolve(subTxt);
    }, 2000);
  });
}

async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`;
    const jsonData = { subscription: [subscriptionUrl] };
    try {
      await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {}
  } else if (UPLOAD_URL) {
    if (!fs.existsSync(listPath)) return;
    const content = fs.readFileSync(listPath, 'utf-8');
    const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic|socks):\/\//.test(line));
    if (nodes.length === 0) return;
    try {
      await axios.post(`${UPLOAD_URL}/api/add-nodes`, JSON.stringify({ nodes }), {
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {}
  }
}

function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath1, bootLogPath2, bootLogPath3, configPath, webPath, botPath, listPath, certPath, keyPath];
    if (NEZHA_PORT) {
      filesToDelete.push(npmPath);
    } else if (NEZHA_SERVER && NEZHA_KEY) {
      filesToDelete.push(phpPath);
    }

    if (process.platform === 'win32') {
      exec(`del /f /q ${filesToDelete.join(' ')} > nul 2>&1`, () => {});
    } else {
      exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, () => {});
    }
  }, 90000);
}
cleanFiles();

async function sendTelegram() {
  if (!BOT_TOKEN || !CHAT_ID) return;
  try {
    const message = fs.readFileSync(subPath, 'utf8');
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const escapedName = NAME.replace(/[_*\[\]()~`>#+=|{}.!-]/g, '\\$&');
    const params = {
      chat_id: CHAT_ID,
      text: `**${escapedName}节点推送**\n\`\`\`${message}\`\`\``,
      parse_mode: 'MarkdownV2'
    };
    await axios.post(url, null, { params });
  } catch (error) {}
}

async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) return;
  try {
    await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL }, {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {}
}

async function startserver() {
  try {
    cleanupOldFiles();
    argoType();
    deleteNodes();
    generateOrLoadKeyPair();
    ensureTlsCertificates(certPath, keyPath);
    await generateConfig();
    await downloadFilesAndRun();
    await extractDomains();
    await sendTelegram();
    await AddVisitTask();
  } catch (error) {}
}
startserver().catch(error => {});

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];

  if (urlPath === `/${SUB_PATH}`) {
    if (subContent) {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(subContent);
    } else {
      try {
        const fileContent = fs.readFileSync(subPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(fileContent);
      } catch (err) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Subscription content not yet available, please try again later.');
      }
    }
    return;
  }

  if (urlPath === '/') {
    try {
      const filePath = path.join(__dirname, 'index.html');
      const data = await fs.promises.readFile(filePath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end("Hello world!<br><br>You can access /{SUB_PATH}(Default: /sub) to get your nodes!");
    }
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found');
});

server.listen(PORT, () => alwaysLog(`http server is running on ${PORT}!`));
