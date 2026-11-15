/**
 * National-team flag resolution (preview 374).
 * Resolve ISO2 from (1) a known flag URL, (2) an exact Chinese / short
 * country name, (3) name + national-team competition (suffix strip).
 * Never invent a flag when the name cannot be resolved. Never assign a
 * country flag to a club whose name merely contains a country
 * (西班牙人, 新英格兰, 皇家社会, …).
 */
(function (root) {
  'use strict';

  const NT_COUNTRY_NAME_TO_ISO2 = {
    '阿富汗': 'af', '阿尔巴尼亚': 'al', '阿尔及利亚': 'dz', '美属萨摩亚': 'as',
    '安道尔': 'ad', '安哥拉': 'ao', '安圭拉': 'ai', '安提瓜和巴布达': 'ag', '安提瓜': 'ag',
    '阿根廷': 'ar', '亚美尼亚': 'am', '阿鲁巴': 'aw', '澳大利亚': 'au', '澳洲': 'au',
    '奥地利': 'at', '阿塞拜疆': 'az',
    '巴哈马': 'bs', '巴林': 'bh', '孟加拉': 'bd', '孟加拉国': 'bd', '巴巴多斯': 'bb',
    '白俄罗斯': 'by', '比利时': 'be', '伯利兹': 'bz', '贝宁': 'bj', '百慕大': 'bm',
    '不丹': 'bt', '玻利维亚': 'bo', '波黑': 'ba', '波斯尼亚': 'ba', '波斯尼亚和黑塞哥维那': 'ba',
    '波斯尼亚和黑塞哥维纳': 'ba',
    '博茨瓦纳': 'bw', '巴西': 'br', '文莱': 'bn', '保加利亚': 'bg', '布基纳法索': 'bf',
    '布隆迪': 'bi',
    '柬埔寨': 'kh', '喀麦隆': 'cm', '加拿大': 'ca', '佛得角': 'cv', '开曼群岛': 'ky',
    '中非': 'cf', '中非共和国': 'cf', '乍得': 'td', '智利': 'cl', '中国': 'cn', '中国队': 'cn',
    '中国香港': 'hk', '香港': 'hk', '中国澳门': 'mo', '澳门': 'mo',
    '中国台北': 'tw', '中华台北': 'tw', '台北': 'tw', '台湾': 'tw',
    '哥伦比亚': 'co', '科摩罗': 'km', '刚果': 'cg', '刚果布': 'cg', '刚果（布）': 'cg', '刚果(布)': 'cg',
    '刚果共和国': 'cg', '刚果金': 'cd', '刚果（金）': 'cd', '刚果(金)': 'cd', '刚果民主共和国': 'cd',
    '库克群岛': 'ck', '哥斯达黎加': 'cr', '克罗地亚': 'hr', '克罗地亞': 'hr', '古巴': 'cu',
    '库拉索': 'cw', '塞浦路斯': 'cy', '捷克': 'cz', '捷克共和国': 'cz',
    '丹麦': 'dk', '吉布提': 'dj', '多米尼克': 'dm', '多米尼加': 'do', '多米尼加共和国': 'do',
    '厄瓜多尔': 'ec', '埃及': 'eg', '萨尔瓦多': 'sv', '英格兰': 'gb-eng',
    '赤道几内亚': 'gq', '厄立特里亚': 'er', '爱沙尼亚': 'ee', '斯威士兰': 'sz', '埃斯瓦蒂尼': 'sz',
    '埃塞俄比亚': 'et',
    '法罗群岛': 'fo', '法罗': 'fo', '斐济': 'fj', '芬兰': 'fi', '法国': 'fr',
    '加蓬': 'ga', '冈比亚': 'gm', '格鲁吉亚': 'ge', '德国': 'de', '加纳': 'gh',
    '直布罗陀': 'gi', '希腊': 'gr', '格林纳达': 'gd', '关岛': 'gu', '危地马拉': 'gt',
    '几内亚': 'gn', '几内亚比绍': 'gw', '圭亚那': 'gy',
    '海地': 'ht', '洪都拉斯': 'hn', '匈牙利': 'hu',
    '冰岛': 'is', '印度': 'in', '印尼': 'id', '印度尼西亚': 'id', '伊朗': 'ir', '伊拉克': 'iq',
    '爱尔兰': 'ie', '以色列': 'il', '意大利': 'it', '科特迪瓦': 'ci', '象牙海岸': 'ci',
    '牙买加': 'jm', '日本': 'jp', '约旦': 'jo',
    '哈萨克': 'kz', '哈萨克斯坦': 'kz', '肯尼亚': 'ke', '科索沃': 'xk',
    '科威特': 'kw', '吉尔吉斯': 'kg', '吉尔吉斯斯坦': 'kg',
    '老挝': 'la', '拉脱维亚': 'lv', '黎巴嫩': 'lb', '莱索托': 'ls', '利比里亚': 'lr',
    '利比亚': 'ly', '列支敦士登': 'li', '立陶宛': 'lt', '卢森堡': 'lu',
    '马达加斯加': 'mg', '马拉维': 'mw', '马来西亚': 'my', '马尔代夫': 'mv', '马里': 'ml',
    '马耳他': 'mt', '毛里塔尼亚': 'mr', '毛里求斯': 'mu', '墨西哥': 'mx',
    '摩尔多瓦': 'md', '摩纳哥': 'mc', '蒙古': 'mn', '黑山': 'me', '蒙特塞拉特': 'ms',
    '摩洛哥': 'ma', '莫桑比克': 'mz', '缅甸': 'mm',
    '纳米比亚': 'na', '尼泊尔': 'np', '荷兰': 'nl', '新喀里多尼亚': 'nc', '新西兰': 'nz',
    '尼加拉瓜': 'ni', '尼日尔': 'ne', '尼日利亚': 'ng', '朝鲜': 'kp', '北韩': 'kp',
    '北马其顿': 'mk', '北马': 'mk', '马其顿': 'mk', '北爱尔兰': 'gb-nir',
    '挪威': 'no',
    '阿曼': 'om',
    '巴基斯坦': 'pk', '巴勒斯坦': 'ps', '巴拿马': 'pa', '巴布亚新几内亚': 'pg',
    '巴拉圭': 'py', '秘鲁': 'pe', '菲律宾': 'ph', '波兰': 'pl', '葡萄牙': 'pt',
    '波多黎各': 'pr',
    '卡塔尔': 'qa',
    '罗马尼亚': 'ro', '俄罗斯': 'ru', '卢旺达': 'rw',
    '圣基茨和尼维斯': 'kn', '圣卢西亚': 'lc', '圣文森特和格林纳丁斯': 'vc',
    '萨摩亚': 'ws', '圣马力诺': 'sm', '圣多美和普林西比': 'st',
    '沙特': 'sa', '沙特阿拉伯': 'sa', '苏格兰': 'gb-sct', '塞内加尔': 'sn',
    '塞尔维亚': 'rs', '塞舌尔': 'sc', '塞拉利昂': 'sl', '新加坡': 'sg',
    '斯洛伐克': 'sk', '斯洛文尼': 'si', '斯洛文尼亚': 'si', '所罗门群岛': 'sb',
    '索马里': 'so', '南非': 'za', '韩国': 'kr', '韩国队': 'kr', '南韩': 'kr',
    '南苏丹': 'ss', '西班牙': 'es', '斯里兰卡': 'lk', '苏丹': 'sd', '苏里南': 'sr',
    '瑞典': 'se', '瑞士': 'ch', '叙利亚': 'sy',
    '塔吉克': 'tj', '塔吉克斯坦': 'tj', '坦桑尼亚': 'tz', '泰国': 'th',
    '东帝汶': 'tl', '多哥': 'tg', '汤加': 'to', '特立尼达和多巴哥': 'tt',
    '突尼斯': 'tn', '土耳其': 'tr', '土库曼': 'tm', '土库曼斯坦': 'tm',
    '特克斯和凯科斯': 'tc',
    '乌干达': 'ug', '乌克兰': 'ua', '阿联酋': 'ae', '阿拉伯联合酋长国': 'ae',
    '美国': 'us', '美国队': 'us', '乌拉圭': 'uy', '乌兹别克': 'uz', '乌兹别克斯坦': 'uz',
    '瓦努阿图': 'vu', '委内瑞拉': 've', '越南': 'vn',
    '威尔士': 'gb-wls',
    '也门': 'ye',
    '赞比亚': 'zm', '津巴布韦': 'zw'
  };

  /* Exact club names that must never receive a country flag. */
  const NT_CLUB_EXCLUSIONS = new Set([
    '西班牙人', '西班牙人队', '皇家社会', '皇家社会队',
    '新英格兰', '新英格兰革命',
    '巴黎圣日耳曼', '曼彻斯特城', '曼彻斯特联', '拜仁慕尼黑',
    '国际米兰', 'AC米兰', '国际米兰队',
    '纽约城', '纽约红牛', '亚特兰大', '蒙特雷',
    '中国业余', '江苏联盟'
  ]);

  const NT_LEAGUE_RE = /欧国联|国际赛|世界杯|欧洲杯|亚洲杯|非洲杯|金杯|奥运|奥运会|世预赛|亚预赛|欧预赛|非预赛|南美预选|女足世界杯|女足亚洲杯|女足欧洲杯|欧洲国家联赛|非洲国家杯|美洲杯|联合杯|联合会杯|奥运会男足|奥运会女足|亚运|大运|世青赛|欧青赛|U20世界杯|U17世界杯|女世界杯|女亚洲杯/;

  function isNationalTeamCompetition(league) {
    return NT_LEAGUE_RE.test(String(league || ''));
  }

  function isCrestPlaceholderLogo(logo) {
    return /placeholder\.(?:png|jpe?g|webp)|team_placeholder|player_placeholder|(?:^|[/?=&_.-])no[-_ ]?photo(?:[-_ ]?yet)?(?:[./?#_=]|$)|\/images\/soccer\/placeholder/i.test(String(logo || ''));
  }

  function stripNtSuffix(name) {
    let s = String(name || '').trim();
    if (!s) return '';
    s = s.replace(/(国家队|女足国家队|男足国家队|女子国家队|男子国家队|女足|男足|女子|男子|女队|男队)$/u, '');
    s = s.replace(/\s*(?:U-?\d+|U\d+岁)$/iu, '');
    s = s.replace(/队$/u, '');
    return s.trim();
  }

  function flagIso2FromName(name, opts) {
    const raw = String(name || '').trim();
    if (!raw) return '';
    if (NT_CLUB_EXCLUSIONS.has(raw)) return '';
    if (NT_COUNTRY_NAME_TO_ISO2[raw]) return NT_COUNTRY_NAME_TO_ISO2[raw];
    const leagueNt = isNationalTeamCompetition(opts && opts.league);
    if (!leagueNt) return '';
    const stripped = stripNtSuffix(raw);
    if (!stripped || stripped === raw) return '';
    if (NT_CLUB_EXCLUSIONS.has(stripped)) return '';
    return NT_COUNTRY_NAME_TO_ISO2[stripped] || '';
  }

  function resolveNationalFlagIso2(logo, name, league, logoIsoFn) {
    if (typeof logoIsoFn === 'function') {
      const fromLogo = logoIsoFn(logo);
      if (fromLogo) return fromLogo;
    }
    return flagIso2FromName(name, { league: league });
  }

  const api = {
    NT_COUNTRY_NAME_TO_ISO2,
    NT_CLUB_EXCLUSIONS,
    isNationalTeamCompetition,
    isCrestPlaceholderLogo,
    stripNtSuffix,
    flagIso2FromName,
    resolveNationalFlagIso2,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NTFlags = api;
})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);
