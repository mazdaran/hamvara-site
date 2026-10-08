from pathlib import Path
import json
root=Path(__file__).resolve().parents[1];out=[]
for lang in ['en','fa','tr']:
 d=json.loads((root/'_site-preview-source/manuals'/f'{lang}.json').read_text())
 for key,slug in [('mrp','mrp-saas'),('sku','sku-bridge')]:
  for c in d[key]['chapters']:
   out.append(dict(id=f'{lang}-{slug}-{c["id"]}',lang=lang,title=d[key]['title']+' — '+c['title'],text='\n'.join(c['steps'])+'\n'+c['expected']+'\n'+c['note'],url='https://hamvara.com/guides/'+('' if lang=='en' else lang+'/')+slug+'.html#'+c['id']))
(root/'support-service/src/knowledge.js').write_text('export const KNOWLEDGE = '+json.dumps(out,ensure_ascii=False)+';\n')
print('Built',len(out),'verified guide excerpts.')
