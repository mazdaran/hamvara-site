const root = document.querySelector('#companyManagement');
const openButton = document.querySelector('#loadCompanyManagement');
const content = document.querySelector('#companyManagementBody');
const status = document.querySelector('#companyManagementStatus');
const say = message => { status.textContent = message; };
const api = (path, options) => {
  if (!window.HAMVARA_MRP_CLOUD) throw new Error('Company management requires a cloud workspace.');
  return window.HAMVARA_MRP_CLOUD.request(`/api/mrp/${path}`, options);
};
const send = (path, method, body) => api(path, { method, body: JSON.stringify(body) });
function element(tag, text) { const node = document.createElement(tag); if (text) node.textContent = text; return node; }
function field(form, label, name, value, options) {
  const wrapper = element('label'), node = document.createElement(options ? 'select' : 'input');
  wrapper.append(element('span', label)); node.name = name;
  if (options) for (const [v, text] of options) { const option = element('option', text); option.value = v; node.append(option); }
  node.value = value || ''; node.required = true; wrapper.append(node); form.append(wrapper); return node;
}
async function busy(button, task) {
  button.disabled = true; say('');
  try { await task(); } catch (error) { say(error.message); } finally { button.disabled = false; }
}
async function load() {
  const [settings, people] = await Promise.all([api('company-profile'), api('members')]);
  content.replaceChildren();
  const p = settings.profile || {}, form = element('form');
  form.append(element('p', 'These are company onboarding preferences. Saving them does not translate the application, convert existing amounts, or change subscription billing.'));
  field(form,'Country code (TR / US / other)','country',p.country).maxLength = 2;
  field(form,'Preferred support language','language',p.language || 'en',[['en','English'],['tr','Türkçe'],['fa','فارسی']]);
  field(form,'Time zone (e.g. Europe/Istanbul or America/New_York)','timezone',p.timezone);
  field(form,'Operating currency (e.g. TRY / USD)','currency',p.currency).maxLength = 3;
  field(form,'Company contact email','contactEmail',p.contactEmail).type = 'email';
  const save = element('button','Save company profile'); save.type = 'submit'; form.append(save);
  form.onsubmit = event => { event.preventDefault(); busy(save, async()=> { await send('company-profile','PUT',Object.fromEntries(new FormData(form))); say('Company profile saved.'); }); };
  content.append(form,element('h3','Named users'));
  content.append(element('p',`${people.members.filter(m=>m.active).length} active users${people.memberLimit ? ` / ${people.memberLimit} allowed` : ''}`));
  const list = element('ul');
  for (const member of people.members) {
    const item = element('li',`${member.username} · ${member.role} · ${member.active ? 'Active' : 'Disabled'} `);
    if (member.active && member.role !== 'CEO' && member.id !== people.currentUserId) {
      const disable = element('button','Disable access'); disable.type = 'button';
      disable.onclick = () => { if (window.confirm(`Disable ${member.username}? This also closes their mobile pairing sessions.`)) busy(disable,async()=> { await send(`members/${encodeURIComponent(member.id)}/disable`,'POST',{}); await load(); say('User access disabled.'); }); };
      item.append(disable);
    }
    list.append(item);
  }
  content.append(list);
  const add = element('form');
  field(add,'Individual username','username','');
  field(add,'Role','role','OPERATOR',[['OPERATOR','Operator'],['PRODUCTION_MANAGER','Production manager'],['FACTORY_MANAGER','Factory manager'],['ACCOUNTING','Accounting']]);
  const create = element('button','Create user'); create.type = 'submit'; add.append(create);
  add.onsubmit = event => { event.preventDefault(); busy(create,async()=> {
    const result = await send('members','POST',Object.fromEntries(new FormData(add)));
    content.replaceChildren();
    const box = element('div'); box.setAttribute('role','status');
    box.append(element('p',`Access key for ${result.member.username}. Save it now and deliver privately to that user. No email was sent. It cannot be displayed again after closing.`));
    const key = element('input'); key.type = 'text'; key.readOnly = true; key.value = result.accessKey; key.setAttribute('aria-label','New user access key'); key.autocomplete = 'off'; box.append(key);
    const dismiss = element('button','I saved the key — hide'); dismiss.type = 'button'; dismiss.onclick=()=>{key.value='';box.remove();openButton.disabled=false;busy(openButton,load);}; box.append(dismiss);
    content.prepend(box); openButton.disabled=true; key.focus(); key.select(); say('Named user created.');
  }); };
  content.append(add);
}
if (root && openButton) openButton.onclick = () => busy(openButton,load);
