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
  England: '英格兰', Scotland: '苏格兰', Wales: '威尔士', Ireland: '爱尔兰', 'Republic of Ireland': '爱尔兰',
  Germany: '德国', France: '法国', Spain: '西班牙', Italy: '意大利', Portugal: '葡萄牙', Netherlands: '荷兰',
  Belgium: '比利时', Switzerland: '瑞士', Austria: '奥地利', Poland: '波兰', Czechia: '捷克', 'Czech Republic': '捷克',
  Croatia: '克罗地亚', Serbia: '塞尔维亚', Slovenia: '斯洛文尼亚', Slovakia: '斯洛伐克', Hungary: '匈牙利',
  Romania: '罗马尼亚', Bulgaria: '保加利亚', Greece: '希腊', Turkey: '土耳其', Russia: '俄罗斯', Ukraine: '乌克兰',
  Japan: '日本', 'Korea Republic': '韩国', 'South Korea': '韩国', China: '中国', 'China PR': '中国',
  Australia: '澳大利亚', 'New Zealand': '新西兰', Nigeria: '尼日利亚', Ghana: '加纳', Senegal: '塞内加尔',
  Cameroon: '喀麦隆', 'Ivory Coast': "科特迪瓦", "Côte d'Ivoire": '科特迪瓦', Morocco: '摩洛哥', Egypt: '埃及',
  Algeria: '阿尔及利亚', Tunisia: '突尼斯', Mali: '马里', Guinea: '几内亚',
};
function posZh(p) { return POS[p] || POS[String(p || '').trim()] || p || '未知位置'; }
function natZh(n) { return NAT[n] || NAT[String(n || '').trim()] || n || ''; }
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
module.exports = { posZh, natZh, heightCm, statusZh };
