'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { DOMParser: LinkeDOMParser } = require('linkedom');

const appHtmlPath = path.join(__dirname, '..', 'app', 'BangumiVault.html');

const FUNCTION_DEPENDENCIES = {
  chronicleMergeComments: ['chronicleCommentKey'],
  chronicleParseBlogComments: ['chronicleParseCommentPost'],
  chronicleIndexEntrySearchValues: ['chronicleCommentSearchValues'],
  chronicleDirectorySearchValues: ['chronicleCommentSearchValues', 'chronicleIndexEntrySearchValues'],
  chronicleIndexCommentsHtml: ['chronicleCommentCount', 'chronicleIndexCommentHtml'],
  chronicleParseIndexPage: [
    'chronicleParseCommentPost',
    'chronicleParseBlogComments',
    'chronicleParseIndexSidebarComments',
    'chronicleCommentKey',
    'chronicleMergeComments',
    'chronicleCommentCount'
  ],
  timelineImageFromNode: ['chronicleRawImageSource'],
  timelineEntityImageFromInfo: ['timelineImageFromNode'],
  chronicleCacheTimelineImages: ['chronicleTimelineBlogId'],
  chronicleTimelineEntityImageFromHtml: ['timelineImageFromNode'],
  chronicleHydrateTimelineEntityImage: ['chronicleTimelineEntityId', 'chronicleTimelineEntityImageFromHtml'],
  chronicleHydrateTimelineBlogImage: ['chronicleBlogContentImageSources', 'chronicleBlogImageFile'],
  chronicleBlogContentImageSources: ['chronicleRawImageSource'],
  chronicleBlogImageFile: ['chronicleRawImageSource'],
  chronicleBlogThumb: ['chronicleBlogImageFile'],
  sanitizeTimelineStatusHtml: ['chronicleRawImageSource'],
  chronicleOfficialLabelsHtml: ['chronicleOfficialLabels'],
  chronicleIndexSubjectRowHtml: ['chronicleOfficialLabels', 'chronicleOfficialLabelsHtml'],
  chronicleIndexTypeConfigs: ['chronicleCommentCount']
};

class DOMParser {
  parseFromString(value, type) {
    const doc = new LinkeDOMParser().parseFromString(value, type);
    if (doc.body && !doc.body.textContent && doc.documentElement?.textContent) {
      Object.defineProperty(doc, 'body', { configurable: true, value: doc.documentElement });
    }
    return doc;
  }
}

function functionSource(source, name) {
  const functionStart = source.indexOf(`function ${name}(`);
  assert.notEqual(functionStart, -1, `missing production function ${name}`);
  const start = source.slice(Math.max(0, functionStart - 6), functionStart) === 'async '
    ? functionStart - 6
    : functionStart;
  const brace = source.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated production function ${name}`);
}

function loadFunctions(names) {
  const source = fs.readFileSync(appHtmlPath, 'utf8');
  const context = {
    DOMParser,
    URL,
    structuredClone,
    Uint8Array,
    window: {},
    CHRONICLE_TYPE_ORDER: [['2', '动画'], ['1', '书籍'], ['4', '游戏'], ['3', '音乐'], ['6', '三次元'], ['0', '其他']],
    chronicleCleanText(node, limit = 500) { return String(node?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, limit); },
    chronicleExtractDateText(value) {
      const match = String(value || '').match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/);
      return match ? `${match[1]}-${match[2]}-${match[3]}${match[4] ? ` ${match[4]}:${match[5]}` : ''}` : '';
    },
    chronicleExtractReplies(value) {
      const text = String(value || '');
      const match = text.match(/[（(]\s*\+?\s*(\d+)\s*[)）]/) || text.match(/(\d+)\s*(?:条?回复|repl(?:y|ies))/i);
      return match ? Number(match[1]) || 0 : null;
    },
    chronicleCleanIndexSummary(value) { return String(value || '').replace(/\s+/g, ' ').trim(); },
    chroniclePagination() { return { nextPage: 0, maxPage: 1 }; },
    chronicleSanitizeBlogHtml(node) { return String(node?.innerHTML || ''); },
    buildTimelineMarks() { return {}; },
    buildTimelineEpisodeMarks() { return {}; },
    rewriteImageUrl(value) { return String(value || ''); },
    apiBaseFor() { return 'https://api.bgm.tv'; },
    state: { collections: {}, settings: {} },
    async localApiAvailable() { return true; },
    async localPostJSON() { throw new Error('localPostJSON stub not configured'); },
    siteBase() { return 'https://bgm.tv'; }
  };
  vm.createContext(context);
  const loaded = new Set();
  const load = name => {
    if (loaded.has(name)) return;
    for (const dependency of FUNCTION_DEPENDENCIES[name] || []) load(dependency);
    vm.runInContext(`${functionSource(source, name)};this.${name}=${name}`, context);
    loaded.add(name);
  };
  for (const name of names) load(name);
  return { source, context };
}

function directoryFixture() {
  const blogs = Array.from({ length: 9 }, (_, index) => {
    const id = index === 0 ? 372266 : 380000 + index;
    return `<div id="item_blog${id}"><a href="/blog/${id}"><img src="//lain.bgm.tv/avatar-${id}.jpg"></a><h2><a class="title" href="/blog/${id}">日志 ${id}</a></h2><div class="tools"><div class="time"><a href="/user/author${index}">作者 ${index}</a> · 2026-4-${15 + index} 21:28 · <a href="/blog/${id}">${index + 1} 回复</a></div></div></div>`;
  }).join('');
  return `<main>
    <ul id="browserItemList"><li><a href="/subject/55113"><img src="//lain.bgm.tv/subject.jpg"></a><h3><a href="/subject/55113">动画</a></h3></li></ul>
    <div id="item_character304"><a href="/character/304"><img src="//lain.bgm.tv/character.jpg"></a><h3>角色</h3></div>
    <div id="item_person265"><a href="/person/265"><img src="//lain.bgm.tv/person.jpg"></a><h3>人物</h3></div>
    <div id="item_ep256"><a href="/ep/256"><img src="//lain.bgm.tv/episode.jpg"></a><h3>ep.3 章节</h3></div>
    ${blogs}
    <ul class="topic-list"><li><a href="/group/topic/462213"><span style="background-image:url('//lain.bgm.tv/group-avatar.jpg')"></span></a><a class="title" href="/group/topic/462213">小组话题</a><small>(+68)</small><p class="info"><span class="author"><a href="/user/group-author">小组作者</a></span><span class="related"><a href="/group/a">技术宅</a></span><span class="time tip_j">2026-5-28 21:04</span></p></li></ul>
    <ul class="topic-list"><li><a href="/subject/topic/57"><span style="background-image:url('//lain.bgm.tv/subject-avatar.jpg')"></span></a><a class="title" href="/subject/topic/57">条目话题</a><small>(+1)</small><p class="info"><span class="author"><a href="/user/subject-author">条目作者</a></span><span class="related"><a href="/subject/52">关联条目</a></span><span class="time tip_j">2008-8-9 18:44</span></p></li></ul>
  </main>`;
}

test('created directory parses all seven entry categories and official row metadata', () => {
  const { context } = loadFunctions(['chronicleParseIndexPage']);
  const parsed = context.chronicleParseIndexPage(directoryFixture(), 1, '101618');
  assert.equal(parsed.entries.length, 15);
  for (const [kind, id] of [['subject', '55113'], ['character', '304'], ['person', '265'], ['episode', '256'], ['blog', '372266'], ['group_topic', '462213'], ['subject_topic', '57']]) {
    assert.ok(parsed.entries.some(item => item.kind === kind && item.id === id), `missing ${kind} ${id}`);
  }
  for (const kind of ['blog', 'group_topic', 'subject_topic']) {
    const item = parsed.entries.find(entry => entry.kind === kind);
    assert.ok(item.image);
    assert.ok(item.publisher);
    assert.ok(item.time);
    assert.equal(typeof item.replies, 'number');
  }
  for (const kind of ['group_topic', 'subject_topic']) {
    const item = parsed.entries.find(entry => entry.kind === kind);
    assert.ok(item.related_title);
    assert.ok(item.related_url);
  }
});

test('directory blogs and both topic types parse as readable in-app articles', () => {
  const { source, context } = loadFunctions(['chronicleParseCommentPost', 'chronicleParseBlogComments', 'chronicleParseBlogDetail', 'chronicleParseTopicDetail']);
  const blog = context.chronicleParseBlogDetail('<div id="viewEntry"><div class="author"><div class="title"><a href="/user/a">日志作者</a></div></div><h1>日志标题</h1><div class="tools">2026-4-15 21:28</div><div id="entry_content">日志正文<img src="/blog.jpg"></div><div class="tagList"><a href="/blog/tag/test">测试标签</a></div><aside id="columnB"><a href="/subject/55113" title="关联条目"><img src="/related.jpg"></a></aside><div id="comment_list"><div class="row" id="comment_1"><div class="inner"><strong><a href="/user/commenter">评论者</a></strong></div><div class="post_actions re_info"><small>#1 - 2026-4-16 10:00</small></div><div class="message">评论内容</div></div></div></div>', '372266');
  const group = context.chronicleParseTopicDetail('<div id="pageHeader"><h1><span>小组 » 讨论</span><br>小组话题</h1></div><div class="postTopic"><div class="post_actions re_info"><small>#1 - 2026-5-28 21:04</small></div><div class="inner"><strong><a href="/user/g">小组作者</a></strong><div class="topic_content">小组正文</div></div></div>', '462213', 'group_topic');
  const subject = context.chronicleParseTopicDetail('<div class="comment-header"><h1 class="title">条目话题</h1></div><div class="postTopic"><div class="post_actions re_info"><small>#1 - 2008-8-9 18:44</small></div><div class="inner"><strong><a href="/user/s">条目作者</a></strong><div class="topic_content">条目正文</div></div></div>', '57', 'subject_topic');
  for (const article of [blog, group, subject]) {
    assert.ok(article.title);
    assert.ok(article.publisher);
    assert.ok(article.time);
    assert.ok(article.content);
    assert.ok(article.content_html);
  }
  assert.equal(blog.tags.length, 1);
  assert.equal(blog.tags[0], '测试标签');
  assert.equal(blog.related_subjects[0].subject_id, '55113');
  assert.equal(blog.comments_count, 1);
  assert.equal(blog.comments[0].publisher, '评论者');
  assert.match(blog.comments[0].content, /评论内容/);
  assert.match(source, /data-index-article-open/);
  assert.match(source, /chronicleIndexArticleDetailHtml/);
  assert.match(source, /chronicleIndexCommentsHtml/);
  assert.match(source, /chronicle-index-tags/);
  assert.match(source, /related_subjects/);
});

test('related subjects take the title from the official subject card instead of the cover-only link', () => {
  const { context } = loadFunctions(['chronicleParseCommentPost', 'chronicleParseBlogComments', 'chronicleParseBlogDetail']);
  const detail = context.chronicleParseBlogDetail(`<div id="viewEntry">
    <h1>日志标题</h1><div id="entry_content">正文</div>
    <aside id="columnB"><div class="entry-related-subjects"><div class="subject-card"><div class="container">
      <a class="cover" href="/subject/570583"><img src="//lain.bgm.tv/pic/cover.jpg" alt=""></a>
      <div class="inner"><p class="title"><a href="/subject/570583">BanG Dream! Ave Mujica</a></p></div>
    </div></div></div></aside>
  </div>`, '377392');
  assert.equal(detail.related_subjects.length, 1);
  assert.equal(detail.related_subjects[0].subject_id, '570583');
  assert.equal(detail.related_subjects[0].title, 'BanG Dream! Ave Mujica');
  assert.match(detail.related_subjects[0].image, /cover\.jpg$/);
});

test('character, person and episode previews only parse their actual detail regions', () => {
  const { context } = loadFunctions(['chronicleParseSpecialDetail']);
  const monoHtml = `<body><nav>导航污染</nav>
    <div id="headerSubject"><h1 class="nameSingle"><a>惣流・アスカ・ラングレー</a><small>惣流·明日香·兰格雷</small></h1></div>
    <div id="columnCrtA"><div class="infobox"><img class="cover" src="/pic/crt/l/00/00/1.jpg"><ul id="infobox">
      <li><span class="tip">简体中文名：</span>惣流·明日香·兰格雷</li>
      <li><span class="tip">性别：</span>女</li>
    </ul></div></div>
    <div id="columnCrtB"><div class="detail">第二适格者，EVA 二号机驾驶员。</div></div>
    <footer>页脚污染</footer></body>`;
  for (const kind of ['character', 'person']) {
    const detail = context.chronicleParseSpecialDetail(monoHtml, '1', kind);
    assert.equal(detail.title, '惣流・アスカ・ラングレー');
    assert.equal(detail.summary, '第二适格者，EVA 二号机驾驶员。');
    assert.doesNotMatch(detail.summary, /导航污染|页脚污染/);
    assert.equal(JSON.stringify(detail.infobox), JSON.stringify([
      { key: '简体中文名', value: '惣流·明日香·兰格雷' },
      { key: '性别', value: '女' }
    ]));
  }

  const episode = context.chronicleParseSpecialDetail(`<body><nav>导航污染</nav>
    <div id="columnEpA"><h2 class="title">ep.3 エンジェルハイロウ</h2><div class="epDesc">第三集剧情简介。</div></div>
    <div id="subject_inner_info"><img src="/pic/cover/l/00/00/2.jpg"><div class="inner"><ul><li><a href="/subject/55113">玉子市场</a></li></ul></div></div>
    <footer>页脚污染</footer></body>`, '256', 'episode');
  assert.equal(episode.title, 'ep.3 エンジェルハイロウ');
  assert.equal(episode.summary, '第三集剧情简介。');
  assert.doesNotMatch(episode.summary, /导航污染|页脚污染/);
  assert.ok(episode.infobox.some(entry => entry.key === '关联条目' && entry.value === '玉子市场'));
});

test('timeline image caching rewrites remote images once and the sanitizer preserves local URLs', async () => {
  const { context } = loadFunctions(['chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages', 'sanitizeTimelineStatusHtml']);
  const calls = [];
  context.localPostJSON = async (route, payload) => {
    calls.push({ route, payload });
    return { ok: true, url: '/images/timeline_100_1.gif', file: '封面缓存/timeline_100_1.gif' };
  };
  const remote = 'https://bgm.tv/img/smiles/tv/01.gif';
  const events = await context.chronicleCacheTimelineImages([
    { event_id: '100', content_html: `<p>状态 <img src="${remote}" data-emoji="1"></p>` },
    { event_id: '101', content_html: `<p>回复 <img src="${remote}" data-emoji="1"></p>` }
  ], new Map());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, '/api/cache-cover');
  assert.ok(events.every(event => event.content_html.includes('/images/timeline_100_1.gif')));
  assert.ok(events.every(event => !event.content_html.includes(remote)));
  assert.ok(events.every(event => event.image_files[0].remote_url === remote));

  const doc = new DOMParser().parseFromString('<div><img src="/images/timeline_100_1.gif" data-emoji="1"></div>', 'text/html');
  const sanitized = context.sanitizeTimelineStatusHtml(doc.querySelector('div'));
  assert.match(sanitized, /src="\/images\/timeline_100_1\.gif"/);
  assert.doesNotMatch(sanitized, /https:\/\/bgm\.tv\/images\//);
});

test('timeline parser keeps the official friend and character card images', () => {
  const { context } = loadFunctions(['timelineEntityLinks', 'timelineEntityImageFromInfo', 'sanitizeTimelineStatusHtml', 'parseTimeCapsulePage']);
  const parsed = context.parseTimeCapsulePage(`<ul>
    <li id="tml_70930648" class="tml_item"><span class="info_full"><a href="/user/akisato"><span class="cover"><img src="//lain.bgm.tv/pic/user/l/000/64/84/648470.jpg"></span></a>将 <a href="/user/akisato">AKISATO</a> 加为了好友<div class="post_actions"><span class="titleTip" title="2026-8-5 07:18"></span></div></span></li>
    <li id="tml_68980922" class="tml_item"><span class="info_full"><a href="/character/116432"><img src="//lain.bgm.tv/pic/crt/s/fa/2a/116432_crt.jpg"></a>收藏了角色 <a href="/character/116432">桜咲朱音</a><div class="post_actions"><span class="titleTip" title="2026-6-13 21:19"></span></div></span></li>
  </ul>`, 1);
  assert.equal(parsed.events.length, 2);
  assert.equal(parsed.events[0].entity_image, 'https://lain.bgm.tv/pic/user/l/000/64/84/648470.jpg');
  assert.equal(parsed.events[1].entity_image, 'https://lain.bgm.tv/pic/crt/s/fa/2a/116432_crt.jpg');
});

test('timeline parser hydrates the missing blog cover from real timeline markup', async () => {
  const { source, context } = loadFunctions([
    'timelineEntityLinks', 'timelineEntityImageFromInfo', 'sanitizeTimelineStatusHtml', 'parseTimeCapsulePage',
    'chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheBlogImages',
    'chronicleHydrateTimelineBlogImage', 'chronicleCacheTimelineImages'
  ]);
  const calls = [];
  context.localPostJSON = async (route, payload) => {
    calls.push({ route, payload });
    return { ok: true, url: `/images/${payload.subject_id}.jpg`, file: `封面缓存/${payload.subject_id}.jpg` };
  };
  context.chronicleBlogs = { items: [], fetched_at: '' };
  context.chronicleContentPage = async (kind, page, indexId, blogId) => {
    assert.equal(kind, 'blog-detail');
    assert.equal(blogId, '374489');
    return '<div id="entry_content"><img src="https://lain.bgm.tv/pic/photo/l/blog-cover.jpg">日志正文</div>';
  };
  context.chronicleParseBlogDetail = () => ({
    id: '374489', title: 'Bangumi条目本地备份工具', content: '日志正文',
    content_html: '<img src="https://lain.bgm.tv/pic/photo/l/blog-cover.jpg">日志正文',
    images: ['https://lain.bgm.tv/pic/photo/l/blog-cover.jpg'], comments: []
  });
  let savedBlogCache = 0;
  context.chronicleSave = async kind => { assert.equal(kind, 'blogs'); savedBlogCache += 1; };
  context.nowISO = () => '2026-08-07T00:00:00.000Z';
  context.window.__bvChronicleTimelineBlogBridge = {
    hydrateImage: (blogId, options) => context.chronicleHydrateTimelineBlogImage(blogId, options),
    save: () => context.chronicleSave('blogs')
  };
  const parsed = context.parseTimeCapsulePage(`<ul>
    <li id="tml_68430862" class="clearit tml_item" data-item-user=""><span class="info_full clearit"><a href="https://bgm.tv/group/a" class="l"><img src="//lain.bgm.tv/pic/icon/m/000/00/00/11.jpg" alt="～技术宅真可怕～" class="rr"></a>加入了 <a href="https://bgm.tv/group/a" class="l">～技术宅真可怕～</a> 小组<div class="info_sub"><span class="tip_j"></span></div><div class="post_actions date"><span title="2026-5-28 02:16" class="titleTip">2月11天前</span> · web</div></span></li>
    <li id="tml_68451556" class="clearit tml_item" data-item-user=""><span class="info_full clearit">发表了新日志：<a href="https://bgm.tv/blog/374489" class="l">Bangumi条目本地备份工具</a><div class="info_sub"><span class="tip_j">日志摘要</span></div><div class="post_actions date"><span title="2026-5-28 21:22" class="titleTip">2月10天前</span> · web</div></span></li>
  </ul>`, 1);
  assert.equal(parsed.events[0].entity_type, 'group');
  assert.equal(parsed.events[0].entity_image, 'https://lain.bgm.tv/pic/icon/m/000/00/00/11.jpg');
  assert.equal(parsed.events[1].entity_type, 'blog');
  assert.equal(parsed.events[1].entity_image, '');

  const events = await context.chronicleCacheTimelineImages(parsed.events, new Map());
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.route === '/api/cache-cover'));
  assert.equal(events[0].entity_image_local_url, '/images/timeline_68430862_entity.jpg');
  assert.equal(events[1].entity_image_local_url, '/images/blog_374489_1.jpg');
  assert.ok(events.every(event => event.image_files.some(file => file.kind === 'entity')));
  assert.equal(context.chronicleBlogs.items[0].id, '374489');
  assert.equal(savedBlogCache, 1);
  const cacheFunction = functionSource(source, 'chronicleCacheTimelineImages');
  assert.match(cacheFunction, /window\.__bvChronicleTimelineBlogBridge/);
  for (const privateName of ['chronicleBlogs', 'chronicleBlogImageFile', 'chronicleBlogContentImageSources', 'chronicleCacheBlogImages', 'chronicleContentPage', 'chronicleParseBlogDetail', 'chronicleSave']) {
    assert.doesNotMatch(cacheFunction, new RegExp(`\\b${privateName}\\b`), `outer timeline cache must not access private ${privateName}`);
  }
  assert.match(source, /window\.__bvChronicleTimelineBlogBridge\s*=\s*\{[\s\S]*hydrateImage:chronicleHydrateTimelineBlogImage,[\s\S]*save:task=>chronicleSave\('blogs',task\?\.controller\?\.signal\)/);
  const readerStart = source.lastIndexOf('async function readAllTimeCapsules()');
  const readerEnd = source.indexOf('async function testLogin()', readerStart);
  const readerSource = source.slice(readerStart, readerEnd);
  assert.match(readerSource, /await chronicleCacheTimelineImages\(parsed\.events,timelineImageMap,task,timelineBlogHydrationCache\)/);
  assert.match(readerSource, /entity_card_image_version:2/);
  assert.match(readerSource, /requiresEntityImageRebuild/);
  assert.match(source, /entity_card_image_version:Math\.max\(0,Number\(source\.entity_card_image_version\)\|\|0\)/);
});

test('blog image refresh preserves valid local files when a new cache write fails', async () => {
  const { context } = loadFunctions(['chronicleCacheBlogImages']);
  const oldRemote = 'https://lain.bgm.tv/pic/photo/l/old.jpg';
  const newRemote = 'https://lain.bgm.tv/pic/photo/l/new.jpg';
  context.localPostJSON = async () => { throw new Error('offline'); };
  const result = await context.chronicleCacheBlogImages({
    content_html: `<img src="${oldRemote}"><img src="${newRemote}">`,
    images: [oldRemote, newRemote],
    image_files: [{ remote_url: oldRemote, local_url: '/images/blog_1_1.jpg', file: '封面缓存/blog_1_1.jpg' }]
  }, '1');
  assert.equal(result.image_files.length, 1);
  assert.equal(result.image_files[0].local_url, '/images/blog_1_1.jpg');
  assert.equal(result.image_files[0].file, '封面缓存/blog_1_1.jpg');
  assert.match(result.content_html, /\/images\/blog_1_1\.jpg/);
  assert.match(result.content_html, /https:\/\/lain\.bgm\.tv\/pic\/photo\/l\/new\.jpg/);
});

test('timeline blog cover reuses cached正文 and skips an inline emoji', async () => {
  const { context } = loadFunctions([
    'chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheBlogImages',
    'chronicleHydrateTimelineBlogImage', 'chronicleCacheTimelineImages'
  ]);
  const emoji = 'https://bgm.tv/img/smiles/tv/01.gif';
  const photo = 'https://lain.bgm.tv/pic/photo/l/cover.jpg';
  context.chronicleBlogs = { items: [{
    id: '88', title: '已有全文', content_html: `<img src="${emoji}" data-emoji="1" alt="(bgm24)"><img src="${photo}">正文`, image_files: []
  }], fetched_at: '' };
  context.chronicleContentPage = async () => { throw new Error('cached正文 should avoid a page request'); };
  context.chronicleParseBlogDetail = () => { throw new Error('cached正文 should avoid reparsing a page'); };
  context.localPostJSON = async (_route, payload) => ({
    ok: true, url: `/images/${payload.subject_id}.gif`, file: `封面缓存/${payload.subject_id}.gif`
  });
  context.chronicleSave = async () => true;
  context.nowISO = () => '2026-08-07T00:00:00.000Z';
  context.window.__bvChronicleTimelineBlogBridge = {
    hydrateImage: (blogId, options) => context.chronicleHydrateTimelineBlogImage(blogId, options),
    save: () => context.chronicleSave('blogs')
  };
  const [event] = await context.chronicleCacheTimelineImages([{
    event_id: '900', entity_type: 'blog', entity_id: '88', links: [{ type: 'blog', id: '88', href: 'https://bgm.tv/blog/88' }], content_html: ''
  }], new Map());
  assert.equal(event.entity_image_remote_url, photo);
  assert.equal(event.entity_image_local_url, '/images/blog_88_2.gif');
  assert.equal(event.image_files.find(file => file.kind === 'entity').remote_url, photo);
});

test('legacy group timeline events can hydrate a cover without rereading history', async () => {
  const { context } = loadFunctions(['chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages']);
  const calls = [];
  context.window.__bvChronicleTimelineEntityBridge = {
    hydrateImage: async () => ({ remote_url: 'https://lain.bgm.tv/pic/icon/l/group-a.jpg' })
  };
  context.localPostJSON = async (route, payload) => {
    calls.push({ route, payload });
    return { ok: true, url: '/images/timeline_legacy_entity.jpg', file: '封面缓存/timeline_legacy_entity.jpg' };
  };
  const [event] = await context.chronicleCacheTimelineImages([{
    event_id: 'legacy-group', entity_type: 'group', entity_id: 'a',
    links: [{ type: 'group', id: 'a', href: 'https://bgm.tv/group/a' }], content_html: ''
  }], new Map());
  assert.equal(calls.length, 1);
  assert.equal(event.entity_image_local_url, '/images/timeline_legacy_entity.jpg');
  assert.equal(event.image_files.find(file => file.kind === 'entity').remote_url, 'https://lain.bgm.tv/pic/icon/l/group-a.jpg');
});

test('group detail hydration extracts the official group icon', async () => {
  const { context } = loadFunctions(['chronicleHydrateTimelineEntityImage']);
  context.chronicleContentPage = async (kind, page, indexId, entityId) => {
    assert.equal(kind, 'group-detail');
    assert.equal(entityId, 'a');
    return '<header id="header"><img class="port ll" src="//lain.bgm.tv/pic/icon/l/group-a.jpg"></header>';
  };
  const result = await context.chronicleHydrateTimelineEntityImage({
    entity_type: 'group', entity_id: 'a', links: [{ type: 'group', id: 'a', href: 'https://bgm.tv/group/a' }]
  });
  assert.equal(result.remote_url, 'https://lain.bgm.tv/pic/icon/l/group-a.jpg');
});

test('duplicate timeline events attempt a missing blog cover only once per refresh', async () => {
  const { context } = loadFunctions(['chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages']);
  let pageRequests = 0;
  context.window.__bvChronicleTimelineBlogBridge = {
    async hydrateImage() { pageRequests += 1; throw new Error('unavailable'); },
    async save() {}
  };
  const events = [1, 2].map(index => ({
    event_id: `duplicate-${index}`, entity_type: 'blog', entity_id: '88',
    links: [{ type: 'blog', id: '88', href: 'https://bgm.tv/blog/88' }], content_html: ''
  }));
  const hydrationCache = new Map();
  const firstPage = await context.chronicleCacheTimelineImages([events[0]], new Map(), null, hydrationCache);
  const secondPage = await context.chronicleCacheTimelineImages([events[1]], new Map(), null, hydrationCache);
  assert.equal(firstPage.length + secondPage.length, 2);
  assert.equal(pageRequests, 1);
});

test('timeline image caching observes cancellation after a completed request', async () => {
  const { context } = loadFunctions(['chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages']);
  const controller = new AbortController();
  const task = { cancelled: false, controller };
  context.throwIfTaskCancelled = current => {
    if(current.cancelled){const error=new Error('cancelled');error.name='AbortError';throw error;}
  };
  context.taskWasCancelled = current => current.cancelled;
  context.localApiAvailable = async signal => {
    assert.equal(signal, controller.signal);
    return true;
  };
  context.localPostJSON = async (_route, _payload, signal) => {
    assert.equal(signal, controller.signal);
    task.cancelled = true;
    return { ok: true, url: '/images/cancelled.jpg', file: '封面缓存/cancelled.jpg' };
  };
  await assert.rejects(() => context.chronicleCacheTimelineImages([{
    event_id: 'cancelled', entity_type: 'character', entity_id: '116432',
    entity_image: 'https://lain.bgm.tv/pic/crt/s/fa/2a/116432_crt.jpg', links: []
  }], new Map(), task), error => error?.name === 'AbortError');
});

test('timeline image caching observes cancellation when a page needs no image work', async () => {
  const { context } = loadFunctions(['chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages']);
  const task = { cancelled: true };
  context.throwIfTaskCancelled = current => {
    if(current.cancelled){const error=new Error('cancelled');error.name='AbortError';throw error;}
  };
  context.taskWasCancelled = current => current.cancelled;
  await assert.rejects(() => context.chronicleCacheTimelineImages([{
    event_id: 'no-image-work', entity_type: 'account', content_html: '', links: []
  }], new Map(), task), error => error?.name === 'AbortError');
});

test('timeline refresh stops when cancellation lands in any final async stage', async () => {
  for (const cancelAt of ['save', 'match', 'drawer']) {
    const { context } = loadFunctions(['readAllTimeCapsules']);
    const task = { cancelled: false, controller: { signal: { aborted: false } } };
    const logs = [];
    let episodeMatchCalls = 0;
    let drawerCalls = 0;
    let renderCalls = 0;
    context.state = { settings: { username: 'tester' }, profile: null };
    context.timelineCache = { complete: false, events: [], media_cache: {} };
    context.askNonBlockingConfirmation = async () => true;
    context.beginLongTask = () => task;
    context.finishLongTask = () => {};
    context.openModal = () => {};
    context.$ = () => ({ textContent: '' });
    context.setProgress = () => {};
    context.log = (_target, message, level = 'info') => logs.push({ message, level });
    context.toast = () => {};
    const requestSignals = [];
    const saveSignals = [];
    context.localGetJSON = async (_path, signal) => {
      requestSignals.push(signal);
      return { ok: true, html: '<main></main>' };
    };
    context.parseTimeCapsulePage = () => ({ events: [], nextPage: 0, maxPage: 1 });
    context.chronicleTimelineImageMap = () => new Map();
    context.chronicleCacheTimelineImages = async events => events;
    context.mergeTimelineEvents = () => [];
    context.buildTimelineMarks = () => ({});
    context.buildTimelineEpisodeMarks = () => ({});
    context.nowISO = () => '2026-08-07T00:00:00.000Z';
    context.saveTimelineCache = async signal => {
      saveSignals.push(signal);
      if(cancelAt === 'save')task.cancelled = true;
    };
    context.matchTimelineEpisodesToCollections = async () => {
      episodeMatchCalls += 1;
      if(cancelAt === 'match')task.cancelled = true;
      return { matchedRows: 0, matchedEpisodes: 0 };
    };
    context.activeDrawerId = cancelAt === 'drawer' ? '1' : null;
    context.openDrawer = async () => { drawerCalls += 1; task.cancelled = true; };
    context.render = () => { renderCalls += 1; };
    context.taskWasCancelled = current => current.cancelled;
    context.throwIfTaskCancelled = current => {
      if(current.cancelled){const error=new Error('cancelled');error.name='AbortError';throw error;}
    };

    await context.readAllTimeCapsules();
    assert.equal(episodeMatchCalls, cancelAt === 'save' ? 0 : 1, cancelAt);
    assert.equal(drawerCalls, cancelAt === 'drawer' ? 1 : 0, cancelAt);
    assert.equal(renderCalls, 0, cancelAt);
    assert.ok(logs.some(entry => entry.level === 'warn' && /任务已终止/.test(entry.message)), cancelAt);
    assert.deepEqual(requestSignals, [task.controller.signal], cancelAt);
    assert.deepEqual(saveSignals, [task.controller.signal], cancelAt);
  }
});

test('local timeline requests abort immediately through their supplied signal', async () => {
  const { context } = loadFunctions(['localGetJSON', 'localPostJSON', 'chronicleContentPage']);
  const requests = [
    signal => context.localGetJSON('/api/timeline-page', signal),
    signal => context.localPostJSON('/api/cache-cover', { url: 'https://example.test/image.jpg' }, signal),
    signal => context.chronicleContentPage('blog-detail', 1, '', '89', signal)
  ];

  for (const request of requests) {
    const controller = new AbortController();
    let receivedSignal = null;
    context.fetch = (_url, options = {}) => new Promise((_resolve, reject) => {
      receivedSignal = options.signal;
      options.signal?.addEventListener('abort', () => {
        const error = new Error('cancelled');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
    const pending = request(controller.signal);
    await Promise.resolve();
    assert.equal(receivedSignal, controller.signal);
    controller.abort();
    await assert.rejects(pending, error => error?.name === 'AbortError');
  }
});

test('timeline image caching preserves an existing entity file path', async () => {
  const { context } = loadFunctions(['chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages']);
  const remote = 'https://lain.bgm.tv/pic/crt/s/fa/2a/116432_crt.jpg';
  context.localPostJSON = async () => ({ ok: true, url: '/images/content.jpg', file: '封面缓存/content.jpg' });
  const [event] = await context.chronicleCacheTimelineImages([{
    event_id: 'existing-file', entity_type: 'character', entity_id: '116432', entity_image: remote,
    content_html: '<img src="https://lain.bgm.tv/pic/photo/l/content.jpg">',
    image_files: [{ kind: 'entity', remote_url: remote, local_url: '/images/existing.jpg', file: '封面缓存/existing.jpg' }]
  }], new Map());
  assert.equal(event.entity_image_local_url, '/images/existing.jpg');
  assert.equal(event.entity_image_local_file, '封面缓存/existing.jpg');
  assert.equal(event.image_files[0].file, '封面缓存/existing.jpg');
});

test('invalid blog detail never overwrites an existing cached blog', async () => {
  const { context } = loadFunctions([
    'chronicleCacheBlogImages', 'chronicleHydrateTimelineBlogImage'
  ]);
  const original = {
    id: '88', title: '旧标题', content: '旧正文', content_html: '旧正文',
    comments: [{ id: 'old-comment', content: '旧评论' }], image_files: []
  };
  context.chronicleBlogs = { items: [structuredClone(original)], fetched_at: '2026-08-01' };
  context.chronicleContentPage = async () => '<main>登录页或限流页</main>';
  context.chronicleParseBlogDetail = () => ({ id: '88', title: '', content: '', content_html: '', comments: [] });
  await assert.rejects(
    () => context.chronicleHydrateTimelineBlogImage('88', { fallbackTitle: '动态标题' }),
    /未能从日志页面识别正文/
  );
  assert.deepEqual(context.chronicleBlogs.items[0], original);
});

test('an image-only blog is valid timeline cover content', async () => {
  const { context } = loadFunctions(['chronicleCacheBlogImages', 'chronicleHydrateTimelineBlogImage']);
  const remote = 'https://lain.bgm.tv/pic/photo/l/image-only.jpg';
  const controller = new AbortController();
  const task = { cancelled: false, controller };
  context.chronicleBlogs = { items: [], fetched_at: '' };
  context.throwIfTaskCancelled = () => {};
  context.chronicleContentPage = async (_kind, _page, _indexId, _blogId, signal) => {
    assert.equal(signal, controller.signal);
    return '<div id="entry_content"><img src="/image-only.jpg"></div>';
  };
  context.chronicleParseBlogDetail = () => ({
    id: '89', title: '纯图日志', content: '', content_html: `<img src="${remote}">`, images: [remote], comments: []
  });
  context.localApiAvailable = async signal => {
    assert.equal(signal, controller.signal);
    return true;
  };
  context.localPostJSON = async (_route, _payload, signal) => {
    assert.equal(signal, controller.signal);
    return { ok: true, url: '/images/blog_89_1.jpg', file: '封面缓存/blog_89_1.jpg' };
  };
  context.nowISO = () => '2026-08-07T00:00:00.000Z';
  const result = await context.chronicleHydrateTimelineBlogImage('89', { task });
  assert.equal(result.changed, true);
  assert.equal(result.imageFile.local_url, '/images/blog_89_1.jpg');
  assert.equal(context.chronicleBlogs.items[0].content_html, '<img src="/images/blog_89_1.jpg">');
});

test('timeline blog hydration propagates cancellation before caching or saving', async () => {
  const { context } = loadFunctions(['chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages']);
  const task = { cancelled: false };
  const hydrationCache = new Map();
  let saves = 0;
  context.throwIfTaskCancelled = current => {
    if(current.cancelled){const error=new Error('cancelled');error.name='AbortError';throw error;}
  };
  context.taskWasCancelled = current => current.cancelled;
  context.window.__bvChronicleTimelineBlogBridge = {
    async hydrateImage() {
      task.cancelled = true;
      return { changed: true, imageFile: { remote_url: 'https://example.test/cover.jpg', local_url: '/images/cover.jpg' } };
    },
    async save() { saves += 1; }
  };
  await assert.rejects(() => context.chronicleCacheTimelineImages([{
    event_id: 'cancel-blog', entity_type: 'blog', entity_id: '89',
    links: [{ type: 'blog', id: '89', href: 'https://bgm.tv/blog/89' }]
  }], new Map(), task, hydrationCache), error => error?.name === 'AbortError');
  assert.equal(hydrationCache.has('89'), false);
  assert.equal(saves, 0);
});

test('timeline blog save does not swallow AbortError', async () => {
  const { context } = loadFunctions(['chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages']);
  context.window.__bvChronicleTimelineBlogBridge = {
    async hydrateImage() { return { changed: true, imageFile: null }; },
    async save() { const error=new Error('cancelled during save');error.name='AbortError';throw error; }
  };
  await assert.rejects(() => context.chronicleCacheTimelineImages([{
    event_id: 'cancel-save', entity_type: 'blog', entity_id: '90',
    links: [{ type: 'blog', id: '90', href: 'https://bgm.tv/blog/90' }]
  }], new Map()), error => error?.name === 'AbortError');
});

test('timeline card entity images are cached even when the event body has no image', async () => {
  const { context } = loadFunctions(['chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages', 'chronicleEntityImage']);
  const calls = [];
  context.localPostJSON = async (route, payload) => {
    calls.push({ route, payload });
    return { ok: true, url: '/images/timeline_68980922_entity.jpg', file: '封面缓存/timeline_68980922_entity.jpg' };
  };
  const remote = 'https://lain.bgm.tv/pic/crt/s/fa/2a/116432_crt.jpg';
  const [event] = await context.chronicleCacheTimelineImages([
    { event_id: '68980922', entity_type: 'character', entity_id: '116432', entity_image: remote, content_html: '', links: [{ type: 'character', id: '116432' }] }
  ], new Map());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, '/api/cache-cover');
  assert.equal(event.entity_image, remote);
  assert.equal(event.entity_image_local_url, '/images/timeline_68980922_entity.jpg');
  assert.equal(event.image_files[0].kind, 'entity');
  assert.equal(context.chronicleEntityImage(event), '/images/timeline_68980922_entity.jpg');
});

test('status cards cache the user avatar fallback when the page has no avatar markup', async () => {
  const { context } = loadFunctions([
    'timelineEntityLinks', 'timelineEntityImageFromInfo', 'sanitizeTimelineStatusHtml', 'parseTimeCapsulePage',
    'chronicleTimelineImageMap', 'timelineEntityRemoteImage', 'chronicleCacheTimelineImages', 'chronicleEntityImage'
  ]);
  const calls = [];
  context.localPostJSON = async (route, payload) => {
    calls.push({ route, payload });
    return { ok: true, url: '/images/timeline_70930335_entity.jpg', file: '封面缓存/timeline_70930335_entity.jpg' };
  };
  const parsed = context.parseTimeCapsulePage(`<ul><li id="tml_70930335" class="clearit tml_item" data-item-user="">
    <span class="info_full clearit"><p class="status">通宵+1</p><div class="post_actions date">
      <a href="https://bgm.tv/user/1244162/timeline/status/70930335" class="tml_comment">回复</a>
      <span title="2026-8-5 06:30" class="titleTip">14小时前</span>
    </div></span>
  </li></ul>`, 1);
  assert.equal(parsed.events[0].entity_image, '');
  const [event] = await context.chronicleCacheTimelineImages(parsed.events, new Map());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].route, '/api/cache-cover');
  assert.match(calls[0].payload.url, /api\.bgm\.tv\/v0\/users\/1244162\/avatar/);
  assert.equal(event.entity_image_local_url, '/images/timeline_70930335_entity.jpg');
  assert.equal(event.image_files[0].kind, 'entity');
  assert.equal(context.chronicleEntityImage(event), '/images/timeline_70930335_entity.jpg');
});

test('legacy timeline caches opt into lazy image migration without startup network work', async () => {
  const { context } = loadFunctions(['migrateTimelineImageCache']);
  context.window = { BANGUMI_VAULT_OFFLINE_STATE: false };
  context.timelineCache = {
    timeline_image_cache_version: 1,
    events: [{ event_id: '70930335', time_text: '2026-8-5 06:30', entity_type: 'status', entity_id: '1244162', links: [{ type: 'user', id: '1244162' }], content_html: '', image_files: [] }]
  };
  let requests = 0;
  context.localPostJSON = async () => { requests += 1; };
  let saves = 0;
  context.saveTimelineCache = async () => { saves += 1; };
  await context.migrateTimelineImageCache();
  assert.equal(requests, 0);
  assert.equal(saves, 0);
  assert.equal(context.timelineCache.timeline_image_cache_version, 3);
  assert.equal(context.timelineCache.image_cache_mode, 'visible-v1');
  assert.equal(context.timelineCache.events[0].entity_image_local_url, undefined);
});

test('timeline offline export rewrites local images without mutating the live cache', async () => {
  const { context } = loadFunctions(['normalizeTimelineCache', 'timelineOfflineImagePath', 'timelineCacheForOfflineExport', 'chronicleArchiveImageFiles']);
  const remote = 'https://bgm.tv/img/smiles/tv/01.gif';
  context.timelineCache = {
    schema: 4,
    username: '1244162',
    site_base: 'https://bgm.tv',
    complete: true,
    all_event_types: true,
    timeline_image_cache_version: 1,
    events: [{
      event_id: '1', time_text: '2026-8-5 07:18',
      content_html: '<p><img src="/images/timeline_1.gif"></p>',
      entity_image: 'https://lain.bgm.tv/avatar.jpg',
      entity_image_local_url: '/images/timeline_avatar.jpg',
      image_files: [
        { remote_url: remote, local_url: '/images/timeline_1.gif', file: '封面缓存/timeline_1.gif' },
        { kind: 'entity', remote_url: 'https://lain.bgm.tv/avatar.jpg', local_url: '/images/timeline_avatar.jpg', file: '封面缓存/timeline_avatar.jpg' }
      ]
    }]
  };
  const relative = context.timelineCacheForOfflineExport('relative');
  assert.match(relative.events[0].content_html, /src="images\/timeline_1\.gif"/);
  assert.equal(relative.events[0].entity_image_local_url, 'images/timeline_avatar.jpg');
  assert.equal(relative.events[0].image_files[0].local_url, 'images/timeline_1.gif');
  assert.match(context.timelineCache.events[0].content_html, /src="\/images\/timeline_1\.gif"/);

  const noImages = context.timelineCacheForOfflineExport('no-images');
  assert.match(noImages.events[0].content_html, new RegExp(remote.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(noImages.events[0].entity_image_local_url, '');
  assert.doesNotMatch(noImages.events[0].content_html, /\/images\//);

  context.chronicleBlogs = { items: [] };
  context.chronicleIndexItems = { indices: {} };
  context.fetch = async url => ({ ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer, url });
  const files = await context.chronicleArchiveImageFiles();
  assert.deepEqual([...files['images/timeline_1.gif']], [1, 2, 3]);
  assert.deepEqual([...files['images/timeline_avatar.jpg']], [1, 2, 3]);
});

test('special directory rows open an internal preview and retain one external action', () => {
  const { source } = loadFunctions(['chronicleIndexSpecialRowHtml']);
  assert.match(source, /data-index-special-preview/);
  assert.match(source, /chronicleSpecialRoute/);
  assert.match(source, /chronicleParseSpecialDetail/);
  assert.doesNotMatch(source, />Bangumi<\/a>/);
  assert.match(source, /#bvi-external/);
  assert.match(source, /chronicle-directory-row chronicle-extra-row/);
  assert.match(source, /chronicle-directory-row chronicle-extra-row chronicle-subject-row/);
  assert.doesNotMatch(source, /data-index-special-preview="\$\{key\}:\$\{esc\(item\.id\)\}"[^>]*>[\s\S]*?阅读<\/button>/);
});

test('time machine external actions are icon-only and inline emoji stay compact in articles and comments', () => {
  const source = fs.readFileSync(appHtmlPath, 'utf8');
  assert.doesNotMatch(source, />Bangumi<\/a>/);
  assert.match(source, /<symbol id="bvi-external"/);
  assert.match(source, /function chronicleExternalLinkHtml\(/);
  assert.match(source, /\.chronicle-comment-body img\[data-emoji\]/);
  assert.match(source, /\.chronicle-blog-content img\[data-emoji\][^{]*\{[^}]*max-height:(?:32|36)px/);
  assert.match(source, /\.chronicle-comment-body img\[data-emoji\][^{]*\{[^}]*max-height:(?:32|36)px/);
});

test('subject directory rows use the same image-main-actions layout as special rows', () => {
  const { source, context } = loadFunctions(['chronicleIndexSubjectRowHtml']);
  const start = source.indexOf('function chronicleIndexSubjectRowHtml');
  const end = source.indexOf('function chronicleBeginRankEdit', start);
  const subjectSource = source.slice(start, end);
  assert.match(subjectSource, /class="chronicle-directory-row chronicle-extra-row chronicle-subject-row"/);
  assert.match(subjectSource, /chronicle-extra-image/);
  assert.match(subjectSource, /chronicle-extra-meta/);
  assert.doesNotMatch(subjectSource, /class="chronicle-directory-row chronicle-subject-row"[^`]*chronicle-subject-cover/);
  context.window = { BANGUMI_VAULT_OFFLINE_STATE: true };
  context.state = { collections: {} };
  context.coverUrl = value => String(value?.image || '');
  context.esc = value => String(value || '');
  context.statusLabel = () => '';
  context.chronicleScoreText = () => '';
  context.chronicleItemInfoBits = () => [];
  context.chronicleDateText = () => '';
  context.siteBase = () => 'https://bgm.tv';
  context.rewriteImageUrl = value => String(value || '');
  context.chronicleExternalLinkHtml = () => '<a class="external"></a>';
  const html = context.chronicleIndexSubjectRowHtml({ subject_id: '55113', title: '动画', image: 'https://lain.bgm.tv/subject.jpg' }, '#1', '动画', '101618');
  assert.match(html, /class="chronicle-directory-row chronicle-extra-row chronicle-subject-row"/);
  assert.match(html, /class="chronicle-extra-image portrait chronicle-subject-cover"/);
  assert.match(html, /class="chronicle-extra-meta chronicle-subject-meta"/);
});

test('cached directory articles refresh missing metadata without discarding正文', () => {
  const { source } = loadFunctions(['chronicleIndexArticleNeedsMetadata']);
  assert.match(source, /function chronicleIndexArticleNeedsMetadata/);
  assert.match(source, /!entry\.item\.content_html\|\|chronicleIndexArticleNeedsMetadata\(entry\)/);
  assert.match(source, /related_subjects\.every/);
  assert.match(source, /暂无评论/);
});

test('created directory builds every requested filter', () => {
  const { context } = loadFunctions(['chronicleIndexTypeConfigs']);
  const detail = { items: [{ type: 2 }], extras: { characters: [{}], persons: [{}], episodes: [{}], blogs: [{}], group_topics: [{}], subject_topics: [{}] } };
  assert.equal(JSON.stringify(context.chronicleIndexTypeConfigs(detail).map(item => item.label)), JSON.stringify(['全部', '动画条目', '角色', '人物', '章节', '日志', '小组话题', '条目话题']));
});

test('my blog detail renders cached comments and nested replies and makes them searchable', () => {
  const { source, context } = loadFunctions(['chronicleCommentSearchValues', 'chronicleIndexCommentsHtml']);
  context.esc = value => String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const comments = [{
    publisher: '主评论作者', time: '2026-08-06 10:00', content: '主评论正文',
    replies: [{ publisher: '嵌套回复作者', time: '2026-08-06 10:05', content: '嵌套回复关键词' }]
  }];
  const values = context.chronicleCommentSearchValues(comments);
  assert.ok(values.includes('嵌套回复作者'));
  assert.ok(values.includes('2026-08-06 10:05'));
  assert.ok(values.includes('嵌套回复关键词'));
  const html = context.chronicleIndexCommentsHtml(comments, 2);
  assert.match(html, /主评论作者/);
  assert.match(html, /嵌套回复作者/);
  assert.match(html, /chronicle-comment reply/);

  const detailStart = source.indexOf('function chronicleBlogDetailHtml');
  const detailEnd = source.indexOf('function chronicleBlogsHtml', detailStart);
  const detailSource = source.slice(detailStart, detailEnd);
  assert.match(detailSource, /chronicleIndexCommentsHtml\(item\.comments,Math\.max\(Number\(item\.comments_count\)\|\|0,Number\(item\.replies\)\|\|0\)\)/);
  assert.match(detailSource, /\$\{commentsHtml\}<div class="chronicle-blog-foot">/);
  const visibleStart = source.indexOf('function chronicleVisibleBlogs');
  const visibleEnd = source.indexOf('function chronicleBlogThumb', visibleStart);
  assert.match(source.slice(visibleStart, visibleEnd), /chronicleCommentSearchValues\(item\.comments\)/);
});

test('directory search values include subjects, special articles and nested comments', () => {
  const { context } = loadFunctions(['chronicleDirectorySearchValues']);
  const values = context.chronicleDirectorySearchValues(
    { id: '88', title: '目录标题', summary: '目录摘要' },
    {
      description: '缓存目录描述',
      items: [{ subject_id: '55113', title: '条目标题', comment: '条目短评', infobox: [{ key: '导演', value: '山田尚子' }] }],
      extras: {
        blogs: [{ id: '7', title: '目录日志', content: '已缓存文章正文', comments: [{ publisher: '文章评论者', time: '2026-08-06 12:00', content: '文章评论', replies: [{ publisher: '楼中楼作者', time: '2026-08-06 12:03', content: '楼中楼关键词' }] }] }],
        group_topics: [{ id: '9', title: '小组话题', related_title: '关联小组' }]
      },
      comments: [{ publisher: '目录评论者', time: '2026-08-06 13:00', content: '目录评论关键词' }]
    }
  );
  for (const expected of ['条目标题', '条目短评', '山田尚子', '已缓存文章正文', '文章评论者', '楼中楼作者', '楼中楼关键词', '关联小组', '目录评论关键词']) {
    assert.ok(values.includes(expected), `missing searchable value: ${expected}`);
  }
});

test('time machine shell animation keyframes use transform instead of layout geometry', () => {
  const { source, context } = loadFunctions(['chronicleTransformFrame']);
  const frame = context.chronicleTransformFrame(
    { left: 100, top: 20, width: 84, height: 32, radius: 999 },
    { left: 40, top: 38, width: 1200, height: 800, radius: 24 },
    0.28
  );
  assert.match(frame.transform, /translate3d\([^)]*\) scale\(/);
  assert.equal(frame.borderRadius, '999px');
  for (const property of ['left', 'top', 'width', 'height']) assert.equal(Object.hasOwn(frame, property), false);
  const openStart = source.indexOf('async function chronicleOpenPanel');
  const openEnd = source.indexOf('/* ---------- page parsing ---------- */', openStart);
  const animationSource = source.slice(openStart, openEnd);
  assert.match(animationSource, /shell\.animate\(\[chronicleTransformFrame\(/);
  assert.doesNotMatch(animationSource, /shell\.animate\(\[chronicleGeometryFrame\(/);
  assert.match(source, /will-change:transform,opacity,border-radius/);
});

test('account events omit the cover column and chronicle search mirrors the main search treatment', () => {
  const source = fs.readFileSync(appHtmlPath, 'utf8');
  const rowsStart = source.indexOf('function chronicleTimelineRowsHtml');
  const rowsEnd = source.indexOf('function chronicleWindowButtonsHtml', rowsStart);
  const rowsSource = source.slice(rowsStart, rowsEnd);
  assert.match(rowsSource, /const withoutCover=category==='account'/);
  assert.match(rowsSource, /const cover=withoutCover\?'':/);
  assert.match(rowsSource, /chronicle-event-without-cover/);
  assert.match(source, /chronicle-otd-without-cover/);
  assert.match(source, /\.chronicle-search:focus-within\{box-shadow:var\(--glass-ring\),var\(--glass-bloom\)/);
  assert.match(source, /class="chronicle-search-mark"[^>]*><use href="#bvi-search"/);
  assert.match(source, /搜索日志标题、正文、评论…/);
  assert.match(source, /搜索目录、条目、文章、评论…/);
});

test('homepage card tilt is not blocked by the entrance animation and controls retain pressed feedback', () => {
  const source = fs.readFileSync(appHtmlPath, 'utf8');
  const cardAnimation = source.slice(source.indexOf('@keyframes bvCardIn'), source.indexOf('}', source.indexOf('@keyframes bvCardIn')) + 1);
  assert.doesNotMatch(cardAnimation, /transform\s*:/, 'the animation must leave transform available for pointer tilt');
  assert.match(source, /html\[data-bv-ui="lg26"\] \.bv-toolrow \.select-trigger:active[\s\S]*?transform:translateY\(1px\) scale\(\.97\)!important/);
  assert.match(source, /html\[data-bv-ui="lg26"\][\s\S]*?#bvToolsBtn:active[\s\S]*?transform:translateY\(1px\) scale\(\.94\)!important/);
  assert.match(source, /html\[data-bv-ui="lg26"\] \.bv-toolrow \.select-trigger,[\s\S]*?color:var\(--text\)!important/);
  assert.match(source, /html\[data-theme="light"\]\[data-bv-ui="lg26"\] \.bv-toolgrp::after\{[\s\S]*?background:var\(--glass-fill\)!important/);
  assert.match(source, /chronicle-event-cover-placeholder" data-chronicle-cover-event/);
  assert.match(source, /chronicleWireLegacyTimelineCovers\(panel\)/);
});

test('desktop page proxy only exposes numeric-ID article routes', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /case 'group-detail': target = new URL\(`\/group\/\$\{slug\(blogId, '小组 ID'\)\}`/);
  assert.match(main, /case 'group-topic-detail': target = new URL\(`\/group\/topic\/\$\{numeric\(blogId, '小组话题 ID'\)\}`/);
  assert.match(main, /case 'subject-topic-detail': target = new URL\(`\/subject\/topic\/\$\{numeric\(blogId, '条目话题 ID'\)\}`/);
  assert.match(main, /case 'character-detail': target = new URL\(`\/character\/\$\{numeric\(blogId, '角色 ID'\)\}`/);
  assert.match(main, /case 'person-detail': target = new URL\(`\/person\/\$\{numeric\(blogId, '人物 ID'\)\}`/);
  assert.match(main, /case 'episode-detail': target = new URL\(`\/ep\/\$\{numeric\(blogId, '章节 ID'\)\}`/);
});

test('portable desktop builds resolve the data directory beside the original exe', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  assert.match(main, /PORTABLE_EXECUTABLE_DIR/);
  assert.match(main, /const executableDir = portableDir && path\.isAbsolute\(portableDir\)/);
  assert.match(main, /path\.join\(executableDir, DATA_DIR_NAME\)/);
});

test('directory mosaics use special-entry covers when no subject covers exist', () => {
  const { context } = loadFunctions(['chronicleIndexCoverList']);
  context.chronicleIndexItems = {
    indices: {
      42599: {
        items: [],
        extras: {
          characters: [{ id: '304', image: 'https://lain.bgm.tv/character.jpg' }],
          persons: [{ id: '265', image: 'https://lain.bgm.tv/person.jpg' }],
          episodes: [], blogs: [], group_topics: [], subject_topics: []
        }
      }
    }
  };
  context.coverUrl = item => String(item?.image || '');
  assert.equal(JSON.stringify(context.chronicleIndexCoverList({ id: '42599' })), JSON.stringify([
    'https://lain.bgm.tv/character.jpg',
    'https://lain.bgm.tv/person.jpg'
  ]));
});

test('directory descriptions render supported BBCode instead of showing its source', () => {
  const { context } = loadFunctions(['chronicleBbcodeHtml', 'chronicleIndexDescriptionHtml']);
  context.esc = value => String(value || '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  const html = context.chronicleIndexDescriptionHtml('[align=center][color=#F08080][size=16][b]完整版本[/b][/size][/color][/align]\n[url=https://bgm.tv/blog/317535]更新说明[/url]');
  assert.match(html, /<strong>完整版本<\/strong>/);
  assert.match(html, /text-align:center/);
  assert.match(html, /color:#F08080/);
  assert.match(html, /font-size:16px/);
  assert.match(html, /<a href="https:\/\/bgm\.tv\/blog\/317535"[^>]*>更新说明<\/a>/);
  assert.doesNotMatch(html, /\[url=|\[\/url\]|\[b\]/);
});

test('a current partial directory cache is terminal for automatic loading', () => {
  const { source, context } = loadFunctions(['chronicleIndexCacheNeedsFetch']);
  const partial = {
    cache_version: 8,
    fetch_status: 'partial',
    fetched_at: '2026-08-05T21:20:41+08:00',
    items: Array.from({ length: 395 }, (_, index) => ({ subject_id: String(index + 1) })),
    extras: {},
    raw_meta: { total: 450, missing_count: 55 }
  };
  assert.equal(context.chronicleIndexCacheNeedsFetch(partial), false);
  assert.equal(context.chronicleIndexCacheNeedsFetch({ ...partial, cache_version: 7 }), true);
  assert.equal(context.chronicleIndexCacheNeedsFetch(null), true);
  assert.match(source, /function chronicleAutoLoadIndex\(\)[\s\S]*chronicleIndexCacheNeedsFetch\(detail\)/);
  assert.match(source, /if\(!force&&cachedDetail&&!chronicleIndexCacheNeedsFetch\(cachedDetail\)\)/);
});

test('timeline directory events show cached mosaics and an explicit local-open action', () => {
  const { source } = loadFunctions(['chronicleTimelineRowsHtml']);
  const start = source.indexOf('function chronicleTimelineRowsHtml');
  const end = source.indexOf('function chronicleWindowButtonsHtml', start);
  const timelineRowsSource = source.slice(start, end);
  assert.match(timelineRowsSource, /chronicleIndexEventCoverHtml\(event/);
  assert.match(timelineRowsSource, /打开本地目录/);
  assert.doesNotMatch(timelineRowsSource, /查看目录\s*→/);
});

test('directory event color stays a category color regardless of words in its description', () => {
  const { context } = loadFunctions(['chronicleEventCategory', 'chronicleEventAccent']);
  context.CHRONICLE_CAT_COLOR = { index: '#7fe3c4' };
  const event = { entity_type: 'index', action: '', text: '收藏了目录：日本动画最高收视率TOP100，介绍里写了完成、看过和删除等普通词语' };
  assert.equal(context.chronicleEventCategory(event), 'index');
  assert.equal(context.chronicleEventAccent(event), '#7fe3c4');
});

test('directory toolbar keeps controls legible without an outer capsule', () => {
  const { source } = loadFunctions([]);
  const toolbarStart = source.indexOf('.chronicle-index-toolbar{');
  const toolbarEnd = source.indexOf('}', toolbarStart);
  const segmentStart = source.indexOf('.chronicle-index-segment,.chronicle-index-sort{');
  const segmentEnd = source.indexOf('}', segmentStart);
  assert.ok(toolbarStart > -1 && toolbarEnd > toolbarStart);
  assert.ok(segmentStart > toolbarEnd && segmentEnd > segmentStart);
  const toolbarRule = source.slice(toolbarStart, toolbarEnd);
  const segmentRule = source.slice(segmentStart, segmentEnd);
  assert.match(toolbarRule, /padding:0/);
  assert.match(toolbarRule, /background:transparent/);
  assert.match(toolbarRule, /box-shadow:none/);
  assert.match(toolbarRule, /backdrop-filter:none/);
  assert.match(segmentRule, /background:var\(--chronicle-index-segment-surface\)/);
  assert.match(segmentRule, /backdrop-filter:var\(--blur\) saturate\(1\.2\)/);
  assert.match(segmentRule, /box-shadow:/);
  const scrollStart = source.indexOf('.chronicle-index-toolbar-scroll{');
  const scrollEnd = source.indexOf('}', scrollStart);
  assert.ok(scrollStart > toolbarEnd && scrollEnd > scrollStart);
  const scrollRule = source.slice(scrollStart, scrollEnd);
  assert.match(scrollRule, /padding:18px 20px/);
  assert.match(scrollRule, /max-width:calc\(100% \+ 20px\)/);
  assert.match(scrollRule, /margin:-18px 0 -18px -20px/);
  assert.match(scrollRule, /overflow-x:auto/);
  assert.match(source, /scroll.className='chronicle-index-toolbar-scroll'/);
  assert.match(source, /oldToolbarScroll=oldToolbar\?\.querySelector\('\.chronicle-index-toolbar-scroll'\)/);
  assert.doesNotMatch(source, /--chronicle-index-surface:/);
  assert.match(source, /--chronicle-index-segment-surface:linear-gradient\(168deg,rgba\(19,22,32,.94\),rgba\(8,10,17,.90\)\)/);
  assert.match(source, /\[data-theme="light"\]\{[^}]*--chronicle-index-segment-surface:linear-gradient\(168deg,rgba\(255,255,255,.96\),rgba\(246,247,252,.92\)\)/s);
});

test('home glass capsules keep backdrop sampling throughout the shared reveal', () => {
  const { source } = loadFunctions([]);
  assert.match(source, /@property --bv-tool-alpha\{syntax:"<number>";inherits:true;initial-value:1\}/);
  const scrollStart = source.indexOf('html.bv-scrolling.bv-scrolled .bv-toolrow');
  const scrollEnd = source.indexOf('\n.bv-toolgrp{', scrollStart);
  assert.notEqual(scrollStart, -1);
  assert.notEqual(scrollEnd, -1);
  const scrollRules = source.slice(scrollStart, scrollEnd);
  assert.match(scrollRules, /transform:translateY\(-10px\)/);
  assert.match(scrollRules, /\.bv-toolrow \.bv-toolgrp\{--bv-tool-alpha:0;pointer-events:none\}/);
  assert.doesNotMatch(scrollRules, /\.bv-toolgrp\{[^}]*opacity:/);

  const baseGroupStart = source.indexOf('.bv-toolgrp{', scrollEnd);
  const baseGroupEnd = source.indexOf('}', baseGroupStart);
  assert.notEqual(baseGroupStart, -1);
  const baseGroupRule = source.slice(baseGroupStart, baseGroupEnd);
  assert.match(baseGroupRule, /--bv-tool-alpha:1/);
  assert.match(baseGroupRule, /transition:--bv-tool-alpha \.22s ease/);
  assert.doesNotMatch(baseGroupRule, /(?:^|[;{])\s*opacity:/);
  assert.doesNotMatch(baseGroupRule, /translateZ\(0\)/);

  const baseMaterialStart = source.indexOf('\n.bv-toolgrp::after{', baseGroupEnd) + 1;
  const baseMaterialEnd = source.indexOf('}', baseMaterialStart);
  assert.notEqual(baseMaterialStart, -1);
  const baseMaterialRule = source.slice(baseMaterialStart, baseMaterialEnd);
  assert.match(baseMaterialRule, /backdrop-filter:/);
  assert.match(baseMaterialRule, /opacity:var\(--bv-tool-alpha\)/);

  const contentStart = source.indexOf('.bv-toolgrp>*{', baseMaterialEnd);
  const contentEnd = source.indexOf('}', contentStart);
  assert.notEqual(contentStart, -1);
  assert.match(source.slice(contentStart, contentEnd), /opacity:var\(--bv-tool-alpha\)/);

  const materialStart = source.indexOf('html[data-bv-ui="lg26"] .bv-toolgrp::after');
  assert.notEqual(materialStart, -1);
  const materialEnd = source.indexOf('html[data-theme="light"][data-bv-ui="lg26"] .bv-toolgrp::after', materialStart);
  assert.notEqual(materialEnd, -1);
  assert.doesNotMatch(source.slice(materialStart, materialEnd), /transition:none!important/);
});

test('sidebar expansion smoothly fades the category capsule in place with hover hysteresis', () => {
  const { source } = loadFunctions([]);
  const layoutStart = source.indexOf('/* ---------- 布局 ---------- */');
  const sideStart = source.indexOf('.side{', layoutStart);
  const sideEnd = source.indexOf('}', sideStart);
  const toolbarStart = source.indexOf('.bv-toolrow{', sideEnd);
  const toolbarEnd = source.indexOf('}', toolbarStart);
  assert.ok(layoutStart > -1 && sideStart > layoutStart && toolbarStart > sideEnd);
  assert.match(source.slice(sideStart, sideEnd), /z-index:29/);
  assert.match(source.slice(sideStart, sideEnd), /transition:width \.3s cubic-bezier\(\.2,\.8,\.2,1\)/);
  assert.match(source.slice(toolbarStart, toolbarEnd), /z-index:28/);
  assert.match(source, /html:not\(\.bv-side-pinned\) \.side\.bv-wide\{width:256px\}/);
  assert.match(source, /html\[data-bv-ui="lg26"\] \.side\{transition:width \.26s cubic-bezier\(\.2,\.8,\.2,1\)!important\}/);
  assert.doesNotMatch(source, /html:not\(\.bv-side-pinned\) \.side:hover\{width:256px\}/);

  const groupStart = source.indexOf('.bv-grp-left{', sideEnd);
  const groupEnd = source.indexOf('}', groupStart);
  const hoverStart = source.indexOf('html:not(.bv-side-pinned).bv-side-hovered .bv-grp-left{', groupEnd);
  const hoverEnd = source.indexOf('}', hoverStart);
  assert.ok(groupStart > sideEnd && hoverStart > groupEnd);
  assert.doesNotMatch(source, /@property --bv-category-alpha/);
  assert.match(source.slice(groupStart, groupEnd), /opacity:1/);
  assert.match(source.slice(groupStart, groupEnd), /transform:none/);
  assert.match(source.slice(groupStart, groupEnd), /visibility:visible/);
  const hoverRule = source.slice(hoverStart, hoverEnd);
  assert.match(hoverRule, /--bv-tool-alpha:0/);
  assert.match(hoverRule, /opacity:1/);
  assert.match(hoverRule, /transform:none/);
  assert.match(hoverRule, /visibility:hidden/);
  assert.match(hoverRule, /transition:--bv-tool-alpha \.22s ease,visibility 0s \.22s/);
  assert.match(hoverRule, /pointer-events:none/);
  assert.match(source, /\.bv-grp-left\.bv-category-hidden,[\s\S]*html:not\(\.bv-side-pinned\)\.bv-side-hovered \.bv-grp-left\{/);
  assert.doesNotMatch(source, /@keyframes bvCategoryReveal/);
  assert.doesNotMatch(source, /\.bv-toolgrp\.bv-grp-left>\*/);
  assert.doesNotMatch(source, /html:not\(\.bv-side-pinned\):has\(\.side:hover\) \.bv-grp-left/);
  assert.doesNotMatch(source, /html:not\(\.bv-side-pinned\):has\(\.side:hover\) \.app::after/);
  const sideBehaviorStart = source.indexOf('/* ---- 侧栏：宽度动画结束后才显示文字');
  const sideBehaviorEnd = source.indexOf('/* ---- 分类分段控件', sideBehaviorStart);
  const sideBehavior = source.slice(sideBehaviorStart, sideBehaviorEnd);
  assert.match(sideBehavior, /bv-side-hovered/);
  assert.match(sideBehavior, /setTimeout\(\(\) => \{[\s\S]*hideCategory\(\);[\s\S]*side\.classList\.add\('bv-wide'\);[\s\S]*root\.classList\.add\('bv-side-hovered'\);[\s\S]*\}, motion\(\) === 'off' \? 0 : 40\)/);
  assert.match(sideBehavior, /setTimeout\(\(\) => \{[\s\S]*side\.classList\.remove\('bv-wide'\);[\s\S]*root\.classList\.remove\('bv-side-hovered'\);[\s\S]*\}, motion\(\) === 'off' \? 0 : 160\)/);
  assert.match(sideBehavior, /categoryRevealTimer = setTimeout\(revealCategory, sideTransitionMs\(\)\)/);
  assert.doesNotMatch(source.slice(hoverEnd, source.indexOf('/* 侧栏玻璃更通透', hoverEnd)), />\*\{opacity:0\}/);
});

test('brand keeps its title visible while the subtitle animates in on hover', () => {
  const { source } = loadFunctions([]);
  assert.match(source, /<span class="bv-brand-t"><b>Bangumi 保管库<\/b><small>本地收藏备份<\/small><\/span>/);

  const subtitleStart = source.indexOf('.bv-brand-t small{');
  const subtitleEnd = source.indexOf('}', subtitleStart);
  const subtitleRule = source.slice(subtitleStart, subtitleEnd);
  assert.match(subtitleRule, /max-height:0/);
  assert.match(subtitleRule, /opacity:0/);
  assert.match(subtitleRule, /overflow:hidden/);
  assert.match(subtitleRule, /transition:/);

  const hoverStart = source.indexOf('.bv-brand:hover .bv-brand-t small');
  const hoverEnd = source.indexOf('}', hoverStart);
  const hoverRule = source.slice(hoverStart, hoverEnd);
  assert.match(hoverRule, /max-height:/);
  assert.match(hoverRule, /opacity:1/);
  assert.doesNotMatch(hoverRule, /\.bv-brand-t b/);

  const responsiveStart = source.indexOf('@media (max-width: 1180px)');
  const responsiveEnd = source.indexOf('@media (max-width: 980px)', responsiveStart);
  assert.doesNotMatch(source.slice(responsiveStart, responsiveEnd), /\.bv-brand-t small\{display:none\}/);
});

test('the sort direction button inherits the group reveal without a second opacity transition', () => {
  const { source } = loadFunctions([]);
  const combinedStart = source.indexOf('html[data-bv-ui="lg26"] .bv-toolrow .select-trigger,\nhtml[data-bv-ui="lg26"] .bv-toolrow .sort-direction-toggle,');
  const combinedEnd = source.indexOf('}', combinedStart);
  assert.notEqual(combinedStart, -1);
  assert.notEqual(combinedEnd, -1);
  const combinedRule = source.slice(combinedStart, combinedEnd);
  assert.match(combinedRule, /transition:background \.16s ease,box-shadow \.16s ease,transform \.12s ease,filter \.12s ease!important/);
  assert.doesNotMatch(combinedRule, /transition:[^}]*opacity/);

  const rebuildCall = source.indexOf('    rebuildSortControls();');
  const groupMount = source.indexOf('/* ---- 悬浮条拆成左右两个玻璃胶囊组');
  assert.ok(rebuildCall > -1 && groupMount > rebuildCall, 'the dynamically created button must exist before toolbar grouping');
});

test('toolbar reveal prewarms glass and contents without isolating their backdrop ancestor', () => {
  const { source } = loadFunctions([]);
  const prewarmStart = source.indexOf('html.bv-scroll-prewarm .bv-toolgrp::after,');
  const prewarmEnd = source.indexOf('}', prewarmStart);
  assert.notEqual(prewarmStart, -1);
  const prewarmRule = source.slice(prewarmStart, prewarmEnd);
  assert.match(prewarmRule, /\.bv-toolgrp>\*/);
  assert.match(prewarmRule, /will-change:opacity/);
  assert.doesNotMatch(prewarmRule, /translateZ\(0\)/);
  assert.doesNotMatch(source, /html\.bv-scroll-prewarm \.bv-toolgrp\{/);

  const materialStart = source.indexOf('html[data-bv-ui="lg26"] .bv-toolrow .select-trigger,', source.indexOf('/* 排序胶囊的默认底色'));
  const materialEnd = source.indexOf('}', materialStart);
  const controlMaterial = source.slice(materialStart, materialEnd);
  assert.match(controlMaterial, /backdrop-filter:none!important/);
  assert.doesNotMatch(controlMaterial, /backdrop-filter:blur/);
  const lightMaterialStart = source.indexOf('html[data-theme="light"][data-bv-ui="lg26"] .bv-toolrow .select-trigger,', materialEnd);
  const lightMaterialEnd = source.indexOf('}', lightMaterialStart);
  const lightControlMaterial = source.slice(lightMaterialStart, lightMaterialEnd);
  assert.match(lightControlMaterial, /backdrop-filter:none!important/);
  assert.doesNotMatch(lightControlMaterial, /backdrop-filter:blur/);

  const watchStart = source.indexOf('  const watchScroll = () => {');
  const watchEnd = source.indexOf('  watchScroll();', watchStart);
  const watchSource = source.slice(watchStart, watchEnd);
  assert.match(watchSource, /root\.classList\.add\('bv-scrolling', 'bv-card-scrolling'\)/);
  assert.match(watchSource, /root\.classList\.add\('bv-scroll-prewarm'\)/);
  assert.match(watchSource, /requestAnimationFrame\(\(\) => \{[\s\S]*root\.classList\.remove\('bv-card-scrolling'\)[\s\S]*requestAnimationFrame\(\(\) => \{[\s\S]*root\.classList\.remove\('bv-scrolling'\)/);
  assert.match(watchSource, /root\.classList\.remove\('bv-scroll-prewarm'\)/);
});

test('pointer tilt caches geometry and does not activate a different card during scrolling', () => {
  const { source } = loadFunctions([]);
  const tiltStart = source.indexOf("  const content = $('content');");
  const firstContentBlock = source.indexOf('  if (content) {', tiltStart);
  const shelfStart = source.indexOf('  if (content) {', firstContentBlock + 1);
  assert.notEqual(tiltStart, -1);
  assert.notEqual(shelfStart, -1);
  const tiltSource = source.slice(tiltStart, shelfStart);
  const moveStart = tiltSource.indexOf("content.addEventListener('pointermove'");
  const moveEnd = tiltSource.indexOf("}, { passive: true });", moveStart);
  assert.notEqual(moveStart, -1);
  assert.notEqual(moveEnd, -1);
  assert.doesNotMatch(tiltSource.slice(moveStart, moveEnd), /getBoundingClientRect/);
  assert.match(tiltSource, /__bvTiltRect/);
  assert.match(tiltSource, /tiltScrollTop/);
  assert.doesNotMatch(tiltSource, /tiltSuspended|suspendTilt/);
  assert.doesNotMatch(tiltSource, /content\.addEventListener\('pointerover'/);
  assert.match(tiltSource, /root\.classList\.contains\('bv-card-scrolling'\)\s*&&\s*el\s*!==\s*active/);
});

test('scroll idle smoothly resumes tilt under a stationary pointer', () => {
  const { source } = loadFunctions([]);
  const tiltStart = source.indexOf("  const content = $('content');");
  const firstContentBlock = source.indexOf('  if (content) {', tiltStart);
  const shelfStart = source.indexOf('  if (content) {', firstContentBlock + 1);
  const tiltSource = source.slice(tiltStart, shelfStart);
  assert.match(tiltSource, /lastPointerX/);
  assert.match(tiltSource, /lastPointerY/);
  assert.match(tiltSource, /content\.addEventListener\('bv-scroll-idle'/);
  assert.match(tiltSource, /document\.elementFromPoint\(lastPointerX,lastPointerY\)/);
  assert.match(tiltSource, /classList\.add\('bv-tilt-resuming'\)/);
  assert.match(tiltSource, /if \(pending\?\.el === el\) pending = null/);

  const resumeStyleStart = source.indexOf('.card.bv-tilt-resuming{');
  const resumeStyleEnd = source.indexOf('}', resumeStyleStart);
  assert.notEqual(resumeStyleStart, -1);
  assert.match(source.slice(resumeStyleStart, resumeStyleEnd), /transition:transform \.24s cubic-bezier/);

  const watchStart = source.indexOf('  const watchScroll = () => {');
  const watchEnd = source.indexOf('  watchScroll();', watchStart);
  const watchSource = source.slice(watchStart, watchEnd);
  assert.match(watchSource, /root\.classList\.remove\('bv-card-scrolling'\);[\s\S]*dispatchEvent\(new Event\('bv-scroll-idle'\)\)/);
});

test('scrolling suppresses hover churn only for cards that are not already tilting', () => {
  const { source } = loadFunctions([]);
  const start = source.indexOf('html.bv-card-scrolling .card:hover:not(.bv-tilting),');
  const end = source.indexOf('.status-ribbon{', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const scrollHoverRules = source.slice(start, end);
  assert.match(scrollHoverRules, /html\.bv-card-scrolling \.hcard:hover:not\(\.bv-tilting\)/);
  assert.match(scrollHoverRules, /\.cover[\s\S]*transform:none!important/);
  assert.match(scrollHoverRules, /\.card-glow[\s\S]*opacity:0!important/);
  assert.match(scrollHoverRules, /\.card-peek[\s\S]*opacity:0!important/);
  assert.doesNotMatch(scrollHoverRules, /transition:none!important/);
  assert.doesNotMatch(scrollHoverRules, /(?:^|[^(])\.bv-tilting/);
});

test('the active lg26 poster wall keeps card shadows outside offscreen paint containment', () => {
  const { source } = loadFunctions([]);
  const sheetStart = source.indexOf('<style id="bv-ui-css-lg26"');
  const sheetEnd = source.indexOf('</style>', sheetStart);
  const wallStart = source.indexOf('/* ---------- 海报墙 ---------- */', sheetStart);
  const cardStart = source.indexOf('.card{', wallStart);
  const cardEnd = source.indexOf('}', cardStart);
  assert.notEqual(sheetStart, -1);
  assert.notEqual(sheetEnd, -1);
  assert.ok(wallStart > sheetStart && wallStart < sheetEnd);
  assert.ok(cardStart > wallStart && cardEnd < sheetEnd);
  const cardRule = source.slice(cardStart, cardEnd);
  assert.doesNotMatch(cardRule, /content-visibility|contain-intrinsic-size|contain:/);

  const shadowStart = source.indexOf('.card::before{', cardEnd);
  const shadowEnd = source.indexOf('}', shadowStart);
  assert.ok(shadowStart > cardEnd && shadowEnd < sheetEnd);
  const shadowRule = source.slice(shadowStart, shadowEnd);
  assert.match(shadowRule, /aspect-ratio:3\/4\.12/);
  assert.match(shadowRule, /box-shadow:/);

  const renderStart = source.indexOf('.card-render{', shadowEnd);
  const renderEnd = source.indexOf('}', renderStart);
  assert.ok(renderStart > shadowEnd && renderEnd < sheetEnd);
  const renderRule = source.slice(renderStart, renderEnd);
  assert.match(renderRule, /content-visibility:auto/);
  assert.match(renderRule, /contain-intrinsic-size:auto\s+\d+px/);
  assert.match(renderRule, /contain:layout style/);

  const coverStart = source.indexOf('.cover-wrap{', renderEnd);
  const coverEnd = source.indexOf('}', coverStart);
  assert.ok(coverStart > renderEnd && coverEnd < sheetEnd);
  const coverRule = source.slice(coverStart, coverEnd);
  assert.match(coverRule, /box-shadow:inset/);
  assert.doesNotMatch(coverRule, /box-shadow:0/);

  const heroStart = source.indexOf('function bvHeroCardHTML');
  const cardsEnd = source.indexOf('function numericValue', heroStart);
  const cardHtmlSource = source.slice(heroStart, cardsEnd);
  assert.equal((cardHtmlSource.match(/class="card-render"/g) || []).length, 1);
  assert.match(cardHtmlSource, /loading="lazy" decoding="async"/);
  assert.equal((cardHtmlSource.match(/decoding="async"/g) || []).length, 3);
});
