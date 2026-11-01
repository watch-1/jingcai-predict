#!/usr/bin/env node
// Prepare JPush AARs for the no-Gradle APK build.
// Usage: node android/prepare-jpush.js <buildDir> <appKey> <channel>
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const JPUSH_VER = process.env.JPUSH_AAR_VERSION || '6.3.0';
const JCORE_VER = process.env.JCORE_AAR_VERSION || '5.6.0';
const MAVEN = process.env.JPUSH_MAVEN || 'https://repo1.maven.org/maven2';

const buildDir = process.argv[2];
const appKey = String(process.argv[3] || '').trim();
const channel = String(process.argv[4] || 'developer-default').trim() || 'developer-default';
if (!buildDir) {
  console.error('usage: prepare-jpush.js <buildDir> <appKey> <channel>');
  process.exit(2);
}

const root = path.join(__dirname);
const libs = path.join(root, 'libs');
fs.mkdirSync(libs, { recursive: true });
fs.mkdirSync(buildDir, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const tmp = dest + '.part';
    const out = fs.createWriteStream(tmp);
    const go = (u, hops) => {
      if (hops > 5) return reject(new Error('too many redirects'));
      https.get(u, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return go(res.headers.location, hops + 1);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + res.statusCode + ' ' + u));
        }
        res.pipe(out);
        out.on('finish', () => out.close(() => {
          fs.renameSync(tmp, dest);
          resolve(dest);
        }));
      }).on('error', reject);
    };
    go(url, 0);
  });
}

async function ensureAar(name, ver) {
  const file = `${name}-${ver}.aar`;
  const local = path.join(libs, file);
  if (fs.existsSync(local) && fs.statSync(local).size > 1000) return local;
  const url = `${MAVEN}/cn/jiguang/sdk/${name}/${ver}/${file}`;
  console.log('download', url);
  await download(url, local);
  return local;
}

function unzip(aar, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  execFileSync('unzip', ['-q', '-o', aar, '-d', dest]);
}

function replacePlaceholders(xml, appKey, channel) {
  return xml
    .replace(/\$\{applicationId\}/g, 'com.tiicai.jingcai')
    .replace(/\$\{JPUSH_APPKEY\}/g, appKey || 'YOUR_JPUSH_APPKEY')
    .replace(/\$\{JPUSH_CHANNEL\}/g, channel);
}

function applicationChildren(manifestXml) {
  const m = manifestXml.match(/<application\b[^>]*>([\s\S]*?)<\/application>/);
  return m ? m[1] : '';
}

function stripDangerousPerms(xml) {
  // AAR may request location / phone / storage — we do not copy those.
  return xml;
}

(async () => {
  const jpushAar = await ensureAar('jpush', JPUSH_VER);
  const jcoreAar = await ensureAar('jcore', JCORE_VER);
  const jpushDir = path.join(buildDir, 'jpush-aar');
  const jcoreDir = path.join(buildDir, 'jcore-aar');
  unzip(jpushAar, jpushDir);
  unzip(jcoreAar, jcoreDir);

  const jpushMan = fs.readFileSync(path.join(jpushDir, 'AndroidManifest.xml'), 'utf8');
  const jcoreMan = fs.readFileSync(path.join(jcoreDir, 'AndroidManifest.xml'), 'utf8');
  let appBits = applicationChildren(jpushMan) + applicationChildren(jcoreMan);
  appBits = replacePlaceholders(appBits, appKey, channel);
  appBits += `
        <service
            android:name="com.tiicai.jingcai.JingcaiPushService"
            android:enabled="true"
            android:exported="false"
            android:process=":pushcore">
            <intent-filter>
                <action android:name="cn.jiguang.user.service.action" />
            </intent-filter>
        </service>
        <receiver
            android:name="com.tiicai.jingcai.GoalPushReceiver"
            android:enabled="true"
            android:exported="false">
            <intent-filter>
                <action android:name="cn.jpush.android.intent.RECEIVER_MESSAGE" />
                <category android:name="com.tiicai.jingcai" />
            </intent-filter>
        </receiver>
`;

  const permBits = replacePlaceholders(
    fs.readFileSync(path.join(root, 'jpush-manifest-snippet.xml'), 'utf8')
      .replace(/<\?xml[^>]*>/, ''),
    appKey,
    channel
  );

  const out = {
    jpushDir,
    jcoreDir,
    jpushJar: path.join(jpushDir, 'classes.jar'),
    jcoreJar: path.join(jcoreDir, 'libs', `jcore-android-${JCORE_VER}.jar`),
    jcoreClassesJar: path.join(jcoreDir, 'classes.jar'),
    jniDir: path.join(jcoreDir, 'jni'),
    resDir: path.join(jpushDir, 'res'),
    appBits,
    permBits: stripDangerousPerms(permBits),
    jpushVer: JPUSH_VER,
    jcoreVer: JCORE_VER,
    hasAppKey: !!(appKey && appKey.length > 8 && appKey !== 'YOUR_JPUSH_APPKEY'),
  };
  fs.writeFileSync(path.join(buildDir, 'jpush-meta.json'), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(buildDir, 'jpush-app-bits.xml'), out.appBits);
  fs.writeFileSync(path.join(buildDir, 'jpush-perm-bits.xml'), out.permBits);
  console.log('jpush ready', JPUSH_VER, 'jcore', JCORE_VER, 'appKey', out.hasAppKey ? 'set' : 'placeholder');
})().catch((e) => {
  console.error('prepare-jpush failed:', e.message);
  process.exit(1);
});
