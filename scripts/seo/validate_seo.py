import os
import sys
import json
from bs4 import BeautifulSoup

def validate_html(filepath):
    print(f'Checking: {filepath}')
    errors = []
    warnings = []

    with open(filepath, 'r', encoding='utf-8') as f:
        html = f.read()

    soup = BeautifulSoup(html, 'html.parser')

    # 1. Title Tag
    title = soup.find('title')
    if not title or not title.text.strip():
        errors.append('Missing <title> tag')
    else:
        title_text = title.text.strip()
        if len(title_text) > 75:
            warnings.append(f'Title tag is long ({len(title_text)} chars > 75): "{title_text[:60]}..."')

    # 2. Meta Description
    meta_desc = soup.find('meta', attrs={'name': 'description'})
    if not meta_desc or not meta_desc.get('content', '').strip():
        errors.append('Missing <meta name="description">')
    else:
        desc_len = len(meta_desc['content'].strip())
        if desc_len < 50:
            warnings.append(f'Meta description is short ({desc_len} chars)')
        elif desc_len > 175:
            warnings.append(f'Meta description is long ({desc_len} chars > 175)')

    # 3. Canonical Tag
    canonical = soup.find('link', attrs={'rel': 'canonical'})
    if not canonical or not canonical.get('href', '').strip():
        warnings.append('Missing <link rel="canonical">')
    else:
        href = canonical['href']
        if not href.startswith('https://'):
            errors.append(f'Canonical link is not HTTPS: {href}')

    # 4. Heading Hierarchy
    h1s = soup.find_all('h1')
    if len(h1s) == 0:
        errors.append('Missing <h1> heading')
    elif len(h1s) > 1:
        warnings.append(f'Multiple ({len(h1s)}) <h1> headings found')

    # 5. Schema.org JSON-LD
    schemas = soup.find_all('script', attrs={'type': 'application/ld+json'})
    if not schemas:
        warnings.append('No JSON-LD schema found')
    else:
        for idx, s in enumerate(schemas):
            try:
                data = json.loads(s.string)
                if '@context' not in data and '@graph' not in data:
                    warnings.append(f'Schema #{idx+1} missing @context')
            except Exception as e:
                errors.append(f'Invalid JSON-LD syntax in schema #{idx+1}: {e}')

    # 6. Logo Validation
    logo = soup.find('a', class_=lambda c: c and 'text-indigo-600' in c and 'font-bold' in c)
    if logo and 'fa-graduation-cap' in str(logo):
        errors.append('Header logo contains non-standard graduation cap icon box! Map to site standard: <a href="index.html" class="text-2xl font-bold text-indigo-600">AcornWise</a>')

    if not errors and not warnings:
        print('  OK: All checks passed!')
    else:
        for e in errors:
            print(f'  [ERROR] {e}')
        for w in warnings:
            print(f'  [WARN]  {w}')

    return len(errors) == 0

def main():
    target_files = []
    if len(sys.argv) > 1:
        target_files = sys.argv[1:]
    else:
        for root, _, files in os.walk('.'):
            if any(p in root for p in ['node_modules', '.git', '.history']):
                continue
            for f in files:
                if f.endswith('.html'):
                    target_files.append(os.path.join(root, f))

    all_passed = True
    for tf in target_files:
        if not validate_html(tf):
            all_passed = False

    if not all_passed:
        sys.exit(1)

if __name__ == '__main__':
    main()
