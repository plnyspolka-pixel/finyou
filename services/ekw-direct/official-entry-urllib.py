# Direct HTTP request test with Python urllib, exactly like official MSiG no-login access.
# Safe GET only, no KW numbers, no cookies exported.
import urllib.request, urllib.error, http.cookiejar, json
sources = [
  ("official-msig-home", "https://wyszukiwarka-msig.ms.gov.pl/"),
  ("ekw-home", "https://ekw.ms.gov.pl/eukw_ogol/menu.do"),
  ("ekw-official-entry", "https://ekw.ms.gov.pl/eukw_ogol/KsiegiWieczyste"),
  ("ekw-menu", "https://przegladarka-ekw.ms.gov.pl/eukw_prz/menu.do"),
]
jar=http.cookiejar.CookieJar()
opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
for label,url in sources:
  req=urllib.request.Request(url)
  try:
    with opener.open(req,timeout=15) as res:
      print("PY_FETCH",json.dumps({"label":label,"status":res.status,"final":res.url.split("?")[0],"contentType":res.headers.get("Content-Type")}))
  except urllib.error.HTTPError as e:
    print("PY_FETCH",json.dumps({"label":label,"status":e.code,"final":e.url.split("?")[0],"contentType":e.headers.get("Content-Type")}))
  except Exception as e:
    print("PY_FETCH",json.dumps({"label":label,"error":type(e).__name__,"details":str(e)[:130]}))
