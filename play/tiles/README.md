# Rudimentary tiler

## VRT Generation

The hotosm-oam bucket contains 2 sets of imagery (or images in 2 different
projections). This uses the UAV imagery of Dar es Salaam.

```bash
pip install yas3fs

yas3fs --read-only --cache-path ~/.cache/yas3fs --no-metadata s3://hotosm-oam data

ls data | grep "\.tif$" | grep -v 356f564e3a0dc9d15553c17cf4583f21 | awk '{print "data/" $1}' > dar.txt
gdalbuildvrt -resolution highest -input_file_list dar.txt dar.vrt
```

## Running

```bash
yas3fs --read-only --cache-path ~/.cache/yas3fs --no-metadata s3://hotosm-oam data

npm install
npm start
```
