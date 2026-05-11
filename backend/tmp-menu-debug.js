const authDbService = require('./services/authDbService');
(async () => {
  try {
    const menus = await authDbService.getAllMenus();
    const filtered = menus.filter(m => /(issue|receipt|production)/i.test(m.MenuName) || /(issue|receipt|production)/i.test(m.MenuPath));
    console.log(JSON.stringify(filtered, null, 2));
    console.log('count', filtered.length);
  } catch (err) {
    console.error('ERR', err.message, err.code, err.stack);
    process.exit(1);
  }
})();
