"""Read exact backend metadata with existing CI authority. Never print values.

At most three GETs to api.cloudflare.com, no redirects/retries or runtime health
requests. Permission denial stops immediately. No credentials leave memory/CI.
"""
import http.client
import json
import os
import re

WORKER = 'network-backend-production'
HOST = 'api.ntwrk.party'
MAX_BODY = 1048576

def identifier(value):
    return value if isinstance(value,str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,128}',value) else None

def project_deployment(result):
    rows=result.get('deployments',[]) if isinstance(result,dict) else []
    if not isinstance(rows,list) or not rows:return None
    row=rows[0]
    if not isinstance(row,dict):return None
    versions=[]
    for v in row.get('versions',[])[:8]:
        if not isinstance(v,dict):continue
        ident=identifier(v.get('version_id'));percent=v.get('percentage')
        if ident and type(percent)in (int,float)and 0<=percent<=100:versions.append({'id':ident,'percentage':percent})
    return {'id':identifier(row.get('id')),'versions':versions}

def project_version(result):
    resources=result.get('resources',{}) if isinstance(result,dict) else {}
    bindings=resources.get('bindings',[]) if isinstance(resources,dict) else []
    # Binding values, script source, runtime config and secret contents excluded.
    safe=[]
    if isinstance(bindings,list):
        for b in bindings[:100]:
            if not isinstance(b,dict):continue
            name=identifier(b.get('name'));kind=identifier(b.get('type'))
            if name and kind:safe.append({'name':name,'type':kind})
    return {'id':identifier(result.get('id')),'bindingNamesAndTypes':safe,
            'databaseAssociationProved':False}

def get_metadata(account,token,path):
    connection=http.client.HTTPSConnection('api.cloudflare.com',timeout=12)
    try:
        connection.request('GET','/client/v4/accounts/'+account+'/'+path,
                           headers={'Authorization':'Bearer '+token,'Accept':'application/json'})
        response=connection.getresponse();raw=response.read(MAX_BODY+1)
        if len(raw)>MAX_BODY:return {'ok':False,'http':response.status,'reason':'response_limit'},None
        try:body=json.loads(raw)
        except (ValueError,UnicodeError):return {'ok':False,'http':response.status,'reason':'invalid_json'},None
        codes=[]
        for e in body.get('errors',[])[:8]:
            if isinstance(e,dict)and type(e.get('code'))is int:codes.append(e['code'])
        ok=response.status==200 and body.get('success')is True
        return {'ok':ok,'http':response.status,'apiCodes':codes},body.get('result')if ok else None
    except Exception:
        # No exception contents: transport errors can embed sensitive inputs.
        return {'ok':False,'reason':'transport_failed'},None
    finally:connection.close()

def inspect(account,token,read=get_metadata):
    if not re.fullmatch('[0-9a-f]{32}',account or '')or not token:
        return {'worker':WORKER,'state':'missing_existing_authority','reads':[]}
    reads=[]
    status,result=read(account,token,'workers/scripts/'+WORKER+'/deployments');reads.append({'operation':'deployments',**status})
    if not status['ok']:return {'worker':WORKER,'state':'deployment_read_unavailable','reads':reads}
    deployment=project_deployment(result)
    status,domains=read(account,token,'workers/domains?hostname='+HOST);reads.append({'operation':'exact_domain',**status})
    mapped=[]
    if status['ok']and isinstance(domains,list):
        for d in domains:
            if isinstance(d,dict)and d.get('hostname')==HOST:
                mapped.append({'hostname':HOST,'service':identifier(d.get('service')),'environment':identifier(d.get('environment'))})
    if not status['ok']:
        return {'worker':WORKER,'state':'domain_read_unavailable','deployment':deployment,'reads':reads}
    version=None
    if deployment and deployment['versions']:
        version_id=deployment['versions'][0]['id']
        status,value=read(account,token,'workers/scripts/'+WORKER+'/versions/'+version_id)
        reads.append({'operation':'active_version',**status})
        if status['ok']and isinstance(value,dict):version=project_version(value)
    return {'worker':WORKER,'state':'metadata_read_completed','deployment':deployment,
            'domainMapping':mapped,'version':version,'reads':reads,'databaseAssociationProved':False}

if __name__=='__main__':
    result=inspect(os.environ.get('CLOUDFLARE_ACCOUNT_ID',''),os.environ.get('CLOUDFLARE_API_TOKEN',''))
    print(json.dumps(result,separators=(',',':'),allow_nan=False))
    raise SystemExit(0 if result['state']=='metadata_read_completed'else 1)
