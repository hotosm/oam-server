# Amazon Web Services Deployment

Deployment is driven by [Troposphere](https://github.com/cloudtools/troposphere) and [Boto](http://boto.readthedocs.org/en/latest/).

## Dependencies

The deployment process expects the following environment variables to be overridden:

```bash
$ export AWS_PROFILE=hotosm-oam
```

Lastly, install Troposphere and Boto:

```bash
$ cd deployment
$ pip install -r requirements.txt
```

## CloudFormation (via Troposphere)

After the dependencies are installed, use the included `Makefile` to emit CloudFormation JSON from the Troposphere stack definitions:

```
$ make
Template validated and written to cfn/swf_stack.json
Template validated and written to cfn/tiler_api_stack.json
Template validated and written to cfn/vpc_stack.json
```

From there, navigate to the CloudFormation console, or use the [Amazon CLI](https://aws.amazon.com/cli/) to launch each stack in order:

- VPC
- Tiler API
- SWF
