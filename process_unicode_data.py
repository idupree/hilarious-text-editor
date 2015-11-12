#!/usr/bin/env python3

# http://www.unicode.org/Public/UNIDATA/UnicodeData.txt

# cat downloads/UnicodeData.txt | cut -d ';' -f 1,2 | grep -v ';<' | less

# % cat UnicodeData.txt | cut -d ';' -f 1,2 | grep -v ';<' | grep -e'[^-A-Z0-9; ]' | wc -c
# 0


import sys, os, time, re, subprocess, json

def main():
  with open('UnicodeData.txt', 'r', encoding='utf-8') as unicode_data, \
       open('unicode_names_map.json', 'w', encoding='utf-8') as unicode_names_map:
    unicode_names_dict = {}
    for line in unicode_data:
      codepoint_hex, full_name, _, _, _, _, _, _, _, _, _, _, _, _, _ = line.split(';')
      if not full_name[:1] == '<':
        codepoint = chr(int(codepoint_hex, 16))
        unicode_names_dict[full_name] = codepoint
        if re.search('-', full_name):
          unicode_names_dict[full_name.replace('-', '')] = codepoint
          unicode_names_dict[full_name.replace('-', ' ')] = codepoint
    # woah, sorting the keys makes the gzipped version
    # take up almost half as much space as it does unsorted
    json.dump(unicode_names_dict, unicode_names_map, indent=0, ensure_ascii=False, sort_keys=True)

if __name__ == '__main__':
  main()

