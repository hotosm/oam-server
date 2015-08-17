CFN_PY_FILES=$(shell find cfn/*.py)
CFN_JSON_FILES=$(patsubst cfn/%.py,cfn/%.json,$(CFN_PY_FILES))

all: $(CFN_JSON_FILES)

clean:
	rm -f cfn/*.json

cfn/%.json: cfn/%.py
	python $<

.PHONY: all clean
