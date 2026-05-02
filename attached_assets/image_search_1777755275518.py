import os
import urllib.request
import urllib.parse
import json
import time
import random

def _get_pexels_key():
    key = os.getenv("PEXELS_API_KEY", "")
    return key.replace('"', '').replace("'", "").strip()

def _picsum_fallback(max_results: int) -> list[str]:
    """Ultimate Safety Net - Beautiful Placeholders"""
    print("[Image Search] 🛟 Using Picsum Safety Net...")
    return [f"https://picsum.photos/seed/{random.randint(1000, 9999)}/800/500" for _ in range(max_results)]

def _wikimedia_fallback(query: str, max_results: int) -> list[str]:
    """Uses Wikimedia Commons - extremely resilient and huge medical library"""
    print(f"[Image Search] 📚 Searching Wikimedia Commons for: '{query}'")
    time.sleep(random.uniform(0.3, 1.0)) # Stagger to prevent 429 crashes
    
    results = []
    try:
        encoded = urllib.parse.quote(query)
        api_url = (
            f"https://commons.wikimedia.org/w/api.php"
            f"?action=query&list=search&srsearch={encoded}+filetype:bitmap"
            f"&srnamespace=6&srlimit={max_results * 2}&format=json"
        )
        req = urllib.request.Request(api_url, headers={"User-Agent": "NibrasBot/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())

        titles = [item["title"] for item in data.get("query", {}).get("search", [])]

        for title in titles[:max_results]:
            encoded_title = urllib.parse.quote(title)
            info_url = (
                f"https://commons.wikimedia.org/w/api.php"
                f"?action=query&titles={encoded_title}"
                f"&prop=imageinfo&iiprop=url&format=json"
            )
            info_req = urllib.request.Request(info_url, headers={"User-Agent": "NibrasBot/1.0"})
            with urllib.request.urlopen(info_req, timeout=5) as resp:
                info_data = json.loads(resp.read().decode())

            for page in info_data.get("query", {}).get("pages", {}).values():
                for ii in page.get("imageinfo", []):
                    url = ii.get("url", "")
                    if url and any(url.lower().endswith(ext) for ext in (".jpg", ".jpeg", ".png")):
                        results.append(url)
                        break

        if results:
            return results
        else:
            return _picsum_fallback(max_results)

    except Exception as exc:
        print(f"[Image Search] ❌ Wikimedia failed: {exc}")
        return _picsum_fallback(max_results)


def search_images(query: str, max_results: int = 8) -> list[str]:
    """Main Entry Point."""
    # 1. Clean the text
    clean_query = query.replace("catarct", "cataract").replace("-", "").strip()
    
    # 2. Extract just the keywords! 
    # Transforms "- Epidemiology and Prevalence of Cataract" into just "Cataract"
    words = clean_query.split()
    if len(words) > 2:
        clean_query = " ".join(words[-2:]) # Grab the last two words

    api_key = _get_pexels_key()

    if not api_key:
        return _wikimedia_fallback(clean_query, max_results)

    print(f"\n[Image Search] 📸 Searching Pexels for: '{clean_query}'")
    
    try:
        url = f"https://api.pexels.com/v1/search?query={urllib.parse.quote(clean_query)}&per_page={max_results}"
        req = urllib.request.Request(url, headers={
            "Authorization": api_key,
            "User-Agent": "Mozilla/5.0"
        })
        
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode())
            
        photos = data.get("photos", [])
        urls = [photo["src"]["medium"] for photo in photos] 
        
        if urls:
            print(f"[Image Search] ✅ Pexels found {len(urls)} images!")
            return urls
        else:
            print("[Image Search] ⚠️ Pexels had no photos for this. Switching to Wikimedia...")
            return _wikimedia_fallback(clean_query, max_results)
            
    except urllib.error.HTTPError as e:
        print(f"[Image Search] ❌ Pexels HTTP Error {e.code}. Please verify your email! Checking fallback...")
        return _wikimedia_fallback(clean_query, max_results)
    except Exception as e:
        print(f"[Image Search] ❌ Pexels Error ({e}). Checking fallback...")
        return _wikimedia_fallback(clean_query, max_results)