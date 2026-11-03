// sw.js - 离线缓存核心脚本（v3：预生成 mp3 讲解版）
const CACHE_NAME = 'kingsvalley-offline-v1';

// 必须预缓存的页面外壳（install 阶段任一失败会导致整个 SW 安装失败，只放最核心的两项）
const SHELL_TO_CACHE = [
  '/',
  '/index.html',
  './data.js'
];

// 全部展品图 / 展区图（逐张尝试缓存，单张 404 不会拖垮安装）
const IMAGES_TO_CACHE = [
  'images/zone1/zone1.png',
  'images/zone2/zone2.jpg',
  'images/zone2/spot1.jpg',
  'images/zone2/spot2.png',
'images/zone2/spot3.jpg',
'images/zone2/spot4.png',
'images/zone2/spot5.jpg',
'images/zone3/zone3.jpg',
'images/zone3/spot2.jpg',
'images/zone3/spot3.jpg',
'images/zone4/zone4.png',
'images/zone4/spot1.png',
'images/zone4/spot2.jpg',
'images/zone4/spot3.png',
'images/zone4/spot5.png',
'images/zone5/zone5.jpg',
'images/zone5/spot1.jpg',
'images/zone5/spot2.png',
'images/zone5/spot3.jpg',
'images/zone6/zone6.png',
'images/zone6/spot1.jpg',
'images/zone6/spot2.jpg',
'images/zone6/spot5.jpg',
'images/zone7/zone7.jpg',
'images/zone7/spot2.jpg',
'images/zone7/spot3.jpg',
'images/zone7/spot4.jpg',
'images/zone8/zone8.jpg',
'images/zone9/zone9.jpg'
];

// 全部讲解音频（预生成 mp3，离线可听；逐条尝试，失败单独跳过）
const AUDIO_TO_CACHE = [
 '/audio/zone1.mp3',
'/audio/zone2.mp3',
'/audio/zone2_spot1.mp3',
'/audio/zone2_spot2.mp3',
'/audio/zone2_spot3.mp3',
'/audio/zone2_spot4.mp3',
'/audio/zone2_spot5.mp3',
'/audio/zone3.mp3',
'/audio/zone3_spot1.mp3',
'/audio/zone3_spot2.mp3',
'/audio/zone3_spot3.mp3',
'/audio/zone4.mp3',
'/audio/zone4_spot1.mp3',
'/audio/zone4_spot2.mp3',
'/audio/zone4_spot3.mp3',
'/audio/zone4_spot4.mp3',
'/audio/zone4_spot5.mp3',
'/audio/zone5.mp3',
'/audio/zone5_spot1.mp3',
'/audio/zone5_spot2.mp3',
'/audio/zone5_spot3.mp3',
'/audio/zone5_spot4.mp3',
'/audio/zone6.mp3',
'/audio/zone6_spot1.mp3',
'/audio/zone6_spot2.mp3',
'/audio/zone6_spot3.mp3',
'/audio/zone6_spot4.mp3',
'/audio/zone6_spot5.mp3',
'/audio/zone7.mp3',
'/audio/zone7_spot1.mp3',
'/audio/zone7_spot2.mp3',
'/audio/zone7_spot3.mp3',
'/audio/zone7_spot4.mp3',
'/audio/zone8.mp3',
'/audio/zone9.mp3'
];

// 1. 安装阶段：缓存页面外壳 + 逐张下载图片
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('正在预缓存页面外壳与全部图片资源...');
      // 外壳用 addAll（缺一不可）
      return cache.addAll(SHELL_TO_CACHE).then(() => {
        // 图片逐张 put，失败单独跳过
        return Promise.all(
          IMAGES_TO_CACHE.concat(AUDIO_TO_CACHE).map(url =>
            cache.add(url).catch(err =>
              console.warn('资源缓存失败(已跳过):', url)
            )
          )
        );
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. 激活阶段：只清理帝王谷自己的旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (
            key.startsWith('kingsvalley-offline-') &&
            key !== CACHE_NAME
          ) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. 拦截请求：缓存优先，离线可用
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  // AI 对话接口不拦截
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // 非 GET 请求不拦截
  if (request.method !== 'GET') {
    return;
  }

  // 不处理其他域名的请求
  if (url.origin !== self.location.origin) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);

    // 先按普通 GET 请求查找缓存，兼容音频 Range 请求
    const cachedResponse = await cache.match(url.href);

    if (cachedResponse) {
      const range = request.headers.get('Range');

      // 普通请求直接返回缓存
      if (!range) {
        return cachedResponse;
      }

      // 处理音频分段请求
      const buffer = await cachedResponse.arrayBuffer();
      const size = buffer.byteLength;
      const match = range.match(/bytes=(\d*)-(\d*)/);

      if (!match) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` }
        });
      }

      let start = match[1] ? Number(match[1]) : 0;
      let end = match[2] ? Number(match[2]) : size - 1;

      if (!match[1] && match[2]) {
        const suffixLength = Number(match[2]);
        start = Math.max(size - suffixLength, 0);
        end = size - 1;
      }

      if (start >= size || start > end) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${size}` }
        });
      }

      end = Math.min(end, size - 1);

      const headers = new Headers(cachedResponse.headers);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
      headers.set('Content-Length', String(end - start + 1));

      return new Response(
        buffer.slice(start, end + 1),
        {
          status: 206,
          headers
        }
      );
    }

    // 没有缓存时请求网络
    return fetch(request);
  })());
});
