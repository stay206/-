'use strict';

const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-timer-throttling');

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function formatSnapshot(snapshot) {
  return JSON.stringify(snapshot, null, 2);
}

async function run() {
  const window = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      backgroundThrottling: false,
      contextIsolation: true,
      partition: 'ui-hover-feedback'
    }
  });

  await window.loadFile(path.join(__dirname, '..', 'app', 'BangumiVault.html'));
  const contents = window.webContents;

  await contents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = performance.now() + 3000;
    const poll = () => {
      const ready = document.querySelector('.side')
        && document.querySelector('#bvToolRow .bv-grp-left')
        && document.querySelector('#bangumiLogoLink.bv-brand .bv-brand-t');
      if (ready) return resolve(true);
      if (performance.now() > deadline) return reject(new Error('UI selectors were not stamped'));
      setTimeout(poll, 10);
    };
    poll();
  })`, true);

  await contents.executeJavaScript(`(() => {
    document.documentElement.classList.remove('bv-side-pinned');
    document.documentElement.dataset.motion = 'full';
    try { localStorage.removeItem('bv_side_pinned'); } catch (_) {}
  })()`);

  const brandDefault = await contents.executeJavaScript(`(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        width: rect.width,
        height: rect.height,
        visible: style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0.05
          && rect.width > 0.5
          && rect.height > 0.5
      };
    };
    const brand = document.querySelector('#bangumiLogoLink.bv-brand');
    const title = brand.querySelector('.bv-brand-t b');
    const subtitle = brand.querySelector('.bv-brand-t small');
    return {
      titleText: title.textContent.trim(),
      subtitleText: subtitle.textContent.trim(),
      title: visible(title),
      subtitle: visible(subtitle)
    };
  })()`);

  const debuggerApi = contents.debugger;
  debuggerApi.attach('1.3');
  await debuggerApi.sendCommand('DOM.enable');
  await debuggerApi.sendCommand('CSS.enable');
  const documentNode = await debuggerApi.sendCommand('DOM.getDocument', { depth: 1 });

  const nodeIdFor = async selector => {
    const result = await debuggerApi.sendCommand('DOM.querySelector', {
      nodeId: documentNode.root.nodeId,
      selector
    });
    if (!result.nodeId) throw new Error(`Missing selector: ${selector}`);
    return result.nodeId;
  };

  const sideNodeId = await nodeIdFor('.side');
  const brandNodeId = await nodeIdFor('#bangumiLogoLink.bv-brand');
  const forceHover = (nodeId, hovered) => debuggerApi.sendCommand('CSS.forcePseudoState', {
    nodeId,
    forcedPseudoClasses: hovered ? ['hover'] : []
  });

  await forceHover(sideNodeId, false);
  await wait(280);
  const sideDefault = await contents.executeJavaScript(`(() => {
    const group = document.querySelector('#bvToolRow .bv-grp-left');
    const style = getComputedStyle(group);
    return {
      opacity: Number(style.opacity),
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration
    };
  })()`);

  await forceHover(sideNodeId, true);

  const sideHover = await contents.executeJavaScript(`(() => {
    const group = document.querySelector('#bvToolRow .bv-grp-left');
    const toolRow = document.querySelector('#bvToolRow');
    const side = document.querySelector('.side');
    const foreground = group.querySelector('#typeDropdown') || group.firstElementChild;
    const opacity = (element, pseudo) => Number(getComputedStyle(element, pseudo || null).opacity);
    const effectiveOpacity = element => {
      let value = 1;
      for (let current = element; current; current = current.parentElement) {
        value *= opacity(current);
        if (current === group) break;
      }
      return value;
    };
    const describeTarget = target => {
      if (!target) return '';
      if (target instanceof Element) {
        const id = target.id ? '#' + target.id : '';
        const classes = [...target.classList].map(name => '.' + name).join('');
        return target.localName + id + classes;
      }
      return String(target);
    };
    const animationDetails = document.getAnimations().filter(animation => {
      const target = animation.effect && animation.effect.target;
      return target instanceof Element && (target === group || group.contains(target));
    }).map(animation => {
      const keyframes = animation.effect && animation.effect.getKeyframes
        ? animation.effect.getKeyframes()
        : [];
      return {
        animation,
        target: describeTarget(animation.effect && animation.effect.target),
        property: animation.transitionProperty || animation.animationName || '',
        keys: [...new Set(keyframes.flatMap(frame => Object.keys(frame)))],
        duration: Number(animation.effect && animation.effect.getComputedTiming().duration) || 0
      };
    });
    const fadeAnimations = animationDetails.filter(detail => {
      const properties = [detail.property, ...detail.keys];
      return properties.some(property => property === 'opacity' || property === '--bv-tool-alpha');
    });
    for (const detail of fadeAnimations) {
      detail.animation.pause();
      detail.animation.currentTime = Math.max(1, detail.duration * 0.45);
    }
    void group.offsetWidth;
    const groupOpacity = opacity(group);
    const foregroundOpacity = effectiveOpacity(foreground);
    const backgroundOpacity = groupOpacity * opacity(group, '::after');
    return {
      sideHovered: side.matches(':hover'),
      sideZIndex: Number(getComputedStyle(side).zIndex),
      toolRowZIndex: Number(getComputedStyle(toolRow).zIndex),
      transitionProperty: getComputedStyle(group).transitionProperty,
      transitionDuration: getComputedStyle(group).transitionDuration,
      groupOpacity,
      foregroundOpacity,
      backgroundOpacity,
      animations: animationDetails.map(({ animation, ...detail }) => detail),
      fadeAnimations: fadeAnimations.map(({ animation, ...detail }) => detail)
    };
  })()`);

  await forceHover(sideNodeId, false);
  await wait(24);
  await forceHover(brandNodeId, true);
  await wait(24);

  const brandHover = await contents.executeJavaScript(`(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: Number(style.opacity),
        width: rect.width,
        height: rect.height,
        visible: style.display !== 'none'
          && style.visibility !== 'hidden'
          && Number(style.opacity) > 0.05
          && rect.width > 0.5
          && rect.height > 0.5
      };
    };
    const brand = document.querySelector('#bangumiLogoLink.bv-brand');
    const text = brand.querySelector('.bv-brand-t');
    const title = text.querySelector('b');
    const subtitle = text.querySelector('small');
    const describeTarget = target => {
      if (!(target instanceof Element)) return String(target || '');
      const id = target.id ? '#' + target.id : '';
      const classes = [...target.classList].map(name => '.' + name).join('');
      return target.localName + id + classes;
    };
    const revealProperties = new Set([
      'opacity', 'width', 'max-width', 'max-height', 'margin-top',
      'clip-path', 'transform', 'translate', 'scale', 'grid-template-rows'
    ]);
    const animations = brand.getAnimations({ subtree: true }).map(animation => {
      const keyframes = animation.effect && animation.effect.getKeyframes
        ? animation.effect.getKeyframes()
        : [];
      const target = animation.effect && animation.effect.target;
      const keys = [...new Set(keyframes.flatMap(frame => Object.keys(frame)))];
      return {
        animation,
        targetElement: target instanceof Element ? target : null,
        target: describeTarget(target),
        property: animation.transitionProperty || animation.animationName || '',
        keys,
        duration: Number(animation.effect && animation.effect.getComputedTiming().duration) || 0
      };
    });
    const revealAnimations = animations.filter(detail => {
      const targetIsText = detail.targetElement === subtitle || detail.targetElement === text;
      return targetIsText && [detail.property, ...detail.keys].some(property => revealProperties.has(property));
    });
    for (const detail of revealAnimations) {
      detail.animation.pause();
      detail.animation.currentTime = Math.max(1, detail.duration * 0.55);
    }
    void subtitle.offsetHeight;
    return {
      brandHovered: brand.matches(':hover'),
      title: visible(title),
      subtitle: visible(subtitle),
      animations: animations.map(({ animation, targetElement, ...detail }) => detail),
      revealAnimations: revealAnimations.map(({ animation, targetElement, ...detail }) => detail)
    };
  })()`);

  await forceHover(brandNodeId, false);
  debuggerApi.detach();
  window.destroy();

  const failures = [];
  if (!sideHover.sideHovered) failures.push('the 收藏状态 sidebar hover state was not activated');
  const transitionSeconds = String(sideDefault.transitionDuration)
    .split(',')
    .map(value => Number.parseFloat(value) || 0);
  const transitionProperties = String(sideDefault.transitionProperty)
    .split(',')
    .map(value => value.trim());
  const opacityTransitionIndex = transitionProperties.indexOf('opacity');
  const hasGroupOpacityTransition = opacityTransitionIndex >= 0
    && (transitionSeconds[opacityTransitionIndex] || transitionSeconds[0] || 0) > 0;
  const hoverReachedFadeTarget = sideHover.groupOpacity < 0.05;
  const hasObservedFade = sideHover.fadeAnimations.length > 0;
  if (!(sideDefault.opacity > 0.95 && hasGroupOpacityTransition && (hasObservedFade || hoverReachedFadeTarget))) {
    failures.push('the 全部分类 group has no opacity fade animation when the sidebar expands');
  } else if (hasObservedFade) {
    const foregroundIsFading = sideHover.foregroundOpacity > 0.03 && sideHover.foregroundOpacity < 0.97;
    const backgroundIsFading = sideHover.backgroundOpacity > 0.03 && sideHover.backgroundOpacity < 0.97;
    if (!foregroundIsFading || !backgroundIsFading) {
      failures.push(`the 全部分类 group has no visible mid-fade frame (foreground=${sideHover.foregroundOpacity}, background=${sideHover.backgroundOpacity})`);
    }
  }
  const sideIsAboveToolbar = Number.isFinite(sideHover.sideZIndex)
    && Number.isFinite(sideHover.toolRowZIndex)
    && sideHover.sideZIndex > sideHover.toolRowZIndex;
  if (!sideIsAboveToolbar) {
    failures.push(`the 全部分类 toolbar is above the expanding sidebar (toolbar z=${sideHover.toolRowZIndex}, sidebar z=${sideHover.sideZIndex})`);
  }
  if (brandDefault.titleText !== 'Bangumi 保管库' || !brandDefault.title.visible) {
    failures.push('the default top-left Bangumi 保管库 title is missing or hidden');
  }
  if (brandDefault.subtitleText !== '本地收藏备份') {
    failures.push('the top-left 本地收藏备份 subtitle is missing');
  }
  if (brandDefault.subtitle.visible) {
    failures.push('本地收藏备份 is already visible before hover instead of being revealed on hover');
  }
  if (!brandHover.brandHovered || !brandHover.subtitle.visible) {
    failures.push('hovering the brand does not reveal 本地收藏备份');
  }
  if (!brandHover.title.visible) {
    failures.push('hovering the brand hides the Bangumi 保管库 main title');
  }
  if (brandHover.revealAnimations.length === 0) {
    failures.push('本地收藏备份 has no hover reveal animation');
  }

  const result = { failures, brandDefault, sideDefault, sideHover, brandHover };
  if (failures.length) {
    console.error('[ui-hover-feedback] FAIL');
    for (const failure of failures) console.error(`- ${failure}`);
    console.error(formatSnapshot(result));
    app.exit(1);
    return;
  }

  console.log('[ui-hover-feedback] PASS');
  console.log(formatSnapshot(result));
  app.exit(0);
}

app.whenReady().then(run).catch(error => {
  console.error('[ui-hover-feedback] HARNESS ERROR');
  console.error(error && error.stack ? error.stack : error);
  app.exit(2);
});
