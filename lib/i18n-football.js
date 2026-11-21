/** Position / nationality English -> Chinese for squad UI. */
const POS = {
  Goalkeeper: '门将', Manager: '主教练', Coach: '教练',
  Defender: '后卫', 'Centre-Back': '中后卫', 'Center Back': '中后卫', 'Left-Back': '左后卫', 'Right-Back': '右后卫',
  'Left Back': '左后卫', 'Right Back': '右后卫', 'Wing-Back': '边翼卫',
  Midfielder: '中场', 'Defensive Midfield': '后腰', 'Central Midfield': '中前卫', 'Attacking Midfield': '前腰',
  'Left Midfield': '左中场', 'Right Midfield': '右中场',
  Forward: '前锋', Attacker: '前锋', Striker: '中锋', 'Centre-Forward': '中锋', 'Center Forward': '中锋',
  'Left Winger': '左边锋', 'Right Winger': '右边锋', Winger: '边锋',
};
const NAT = {
  Norway: '挪威', Sweden: '瑞典', Denmark: '丹麦', Finland: '芬兰', Iceland: '冰岛',
  'United States': '美国', USA: '美国', Canada: '加拿大', Mexico: '墨西哥', Brazil: '巴西', Argentina: '阿根廷',
  Colombia: '哥伦比亚', Uruguay: '乌拉圭', Chile: '智利', Peru: '秘鲁', Ecuador: '厄瓜多尔', Paraguay: '巴拉圭',
  Bolivia: '玻利维亚', Venezuela: '委内瑞拉', 'Costa Rica': '哥斯达黎加', Panama: '巴拿马', Jamaica: '牙买加',
  England: '英格兰', Scotland: '苏格兰', Wales: '威尔士', Ireland: '爱尔兰', 'Republic of Ireland': '爱尔兰',
  'Northern Ireland': '北爱尔兰', Germany: '德国', France: '法国', Spain: '西班牙', Italy: '意大利',
  Portugal: '葡萄牙', Netherlands: '荷兰',
  Belgium: '比利时', Switzerland: '瑞士', Austria: '奥地利', Poland: '波兰', Czechia: '捷克', 'Czech Republic': '捷克',
  Croatia: '克罗地亚', Serbia: '塞尔维亚', Slovenia: '斯洛文尼亚', Slovakia: '斯洛伐克', Hungary: '匈牙利',
  Romania: '罗马尼亚', Bulgaria: '保加利亚', Greece: '希腊', Turkey: '土耳其', 'Türkiye': '土耳其', Turkiye: '土耳其',
  Russia: '俄罗斯', Ukraine: '乌克兰',
  Albania: '阿尔巴尼亚', Andorra: '安道尔', Armenia: '亚美尼亚', Azerbaijan: '阿塞拜疆', Belarus: '白俄罗斯',
  'Bosnia-Herzegovina': '波黑', 'Bosnia and Herzegovina': '波黑', Cyprus: '塞浦路斯', Estonia: '爱沙尼亚',
  'Faroe Islands': '法罗群岛', Georgia: '格鲁吉亚', Gibraltar: '直布罗陀', Israel: '以色列',
  Kazakhstan: '哈萨克斯坦', Kosovo: '科索沃', Latvia: '拉脱维亚', Liechtenstein: '列支敦士登',
  Lithuania: '立陶宛', Luxembourg: '卢森堡', Malta: '马耳他', Moldova: '摩尔多瓦', Montenegro: '黑山',
  'North Macedonia': '北马其顿', 'San Marino': '圣马力诺',
  Japan: '日本', 'Korea Republic': '韩国', 'South Korea': '韩国', China: '中国', 'China PR': '中国',
  Bahrain: '巴林',
  Australia: '澳大利亚', 'New Zealand': '新西兰', Iran: '伊朗', Iraq: '伊拉克', 'Saudi Arabia': '沙特',
  Qatar: '卡塔尔', Uzbekistan: '乌兹别克斯坦', Jordan: '约旦',
  Nigeria: '尼日利亚', Ghana: '加纳', Senegal: '塞内加尔',
  Cameroon: '喀麦隆', 'Ivory Coast': "科特迪瓦", "Côte d'Ivoire": '科特迪瓦', Morocco: '摩洛哥', Egypt: '埃及',
  Algeria: '阿尔及利亚', Tunisia: '突尼斯', Mali: '马里', Guinea: '几内亚', 'South Africa': '南非',
  'Cape Verde': '佛得角', 'Congo DR': '刚果金',
  Guatemala: '危地马拉', Honduras: '洪都拉斯', Haiti: '海地', Suriname: '苏里南',
  Mozambique: '莫桑比克', 'Burkina Faso': '布基纳法索', 'El Salvador': '萨尔瓦多',
  Curacao: '库拉索', 'Curaçao': '库拉索', Guadeloupe: '瓜德罗普',
};
// Sporttery sometimes shortens nation names (斯洛文尼, 阿尔巴尼, 哈萨克).
const NAT_ZH_ALIAS = {
  '斯洛文尼': 'Slovenia',
  '阿尔巴尼': 'Albania',
  '哈萨克': 'Kazakhstan',
  '波黑': 'Bosnia-Herzegovina',
  '沙特': 'Saudi Arabia',
  '沙特阿拉伯': 'Saudi Arabia',
  '韩国': 'South Korea',
  '科特迪瓦': 'Ivory Coast',
  '爱尔兰': 'Republic of Ireland',
  '捷克': 'Czechia',
  '土耳其': 'Türkiye',
  '刚果（金）': 'Congo DR',
  '刚果民主共和国': 'Congo DR',
  '阿尔及利': 'Algeria',
  '乌兹别克': 'Uzbekistan',
  '哥斯达': 'Costa Rica',
  '布基纳': 'Burkina Faso',
};
function posZh(p) { return POS[p] || POS[String(p || '').trim()] || p || '未知位置'; }
function natZh(n) { return NAT[n] || NAT[String(n || '').trim()] || n || ''; }
function natEn(zh) {
  const z = String(zh || '').trim();
  if (!z) return '';
  if (NAT_ZH_ALIAS[z]) return NAT_ZH_ALIAS[z];
  for (const [en, nameZh] of Object.entries(NAT)) {
    if (nameZh === z) return en;
  }
  return /[A-Za-z]/.test(z) ? z : '';
}
function heightCm(h) {
  const s = String(h || '').trim();
  if (!s) return '';
  const cm = s.match(/(\d{2,3})\s*cm/i); if (cm) return cm[1] + ' 厘米';
  const m = s.match(/(\d)\.(\d{2})\s*m/i); if (m) return Math.round(Number(m[1] + '.' + m[2]) * 100) + ' 厘米';
  const ft = s.match(/(\d+)\s*(?:ft|'|′)\s*(\d+)?/i);
  if (ft) {
    const inches = Number(ft[1]) * 12 + Number(ft[2] || 0);
    return Math.round(inches * 2.54) + ' 厘米';
  }
  if (/^\d{2,3}$/.test(s)) return s + ' 厘米';
  return s;
}
function statusZh(s) {
  const m = { Active: '现役', Retired: '退役', 'Injured': '伤停' };
  return m[s] || s || '';
}
module.exports = { posZh, natZh, natEn, heightCm, statusZh, NAT, NAT_ZH_ALIAS };
