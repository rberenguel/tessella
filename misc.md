```
echo '
"palettes/berry-nebula-32x.png",
...,
"palettes/wish-gb-32x.png",
' | grep -o '".*"' | tr -d '"' | awk -F'[/.]' '{
    slug = $2;
    sub(/-32x$/, "", slug);
    name = slug;
    gsub(/-/, " ", name);
    n = split(name, a, " ");
    name_cap = "";
    for (i=1; i<=n; i++) {
        name_cap = name_cap toupper(substr(a[i],1,1)) substr(a[i],2) (i==n ? "" : " ");
    }
    printf "* [%s](https://lospec.com/palette-list/%s)\n", name_cap, slug;
}'
```
