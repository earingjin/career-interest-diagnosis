// 관리자 비밀번호 해시를 만든다. 출력된 한 줄을 .env.local 의 ADMIN_PASSWORD_HASH 에 붙여 넣는다.
//
//   node scripts/hash-admin-password.mjs
//
// 비밀번호는 명령 인자로 받지 않는다 (셸 기록에 남기 때문). 터미널에서 입력하면 화면에 보이지 않고,
// 파이프로 넘길 수도 있다.  예)  echo "비밀번호" | node scripts/hash-admin-password.mjs
//
// 형식: scrypt:<N>:<r>:<p>:<salt>:<hash>  (src/lib/admin/password.ts 와 같은 형식)
// 구분자에 달러 기호를 쓰지 않으므로 .env 파일에 따옴표 없이 그대로 적어도 된다.

import { randomBytes, scrypt } from "node:crypto";

const N = 32768;
const r = 8;
const p = 1;
const MIN_LENGTH = 12;

function readFromTerminal(prompt) {
  return new Promise((resolve) => {
    process.stderr.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stderr.write("\n");
          resolve(value);
          return;
        }
        if (ch === "\u0003") process.exit(130); // Ctrl+C
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readFromPipe() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

let password;
if (process.stdin.isTTY) {
  password = await readFromTerminal("관리자 비밀번호 (입력해도 화면에 보이지 않아요): ");
  const again = await readFromTerminal("한 번 더 입력: ");
  if (password !== again) {
    console.error("두 번 입력한 비밀번호가 달라요.");
    process.exit(1);
  }
} else {
  password = await readFromPipe();
}

if (password.length < MIN_LENGTH) {
  console.error(`비밀번호는 ${MIN_LENGTH}자 이상이어야 해요.`);
  process.exit(1);
}

const salt = randomBytes(16);
const hash = await new Promise((resolve, reject) => {
  scrypt(password.normalize("NFKC"), salt, 32, { N, r, p, maxmem: 128 * N * r * 2 + 128 * r * p }, (error, key) =>
    error ? reject(error) : resolve(key),
  );
});

console.log(["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join(":"));
