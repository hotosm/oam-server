import boto


def get_subnet_cidr_block():
    """Generator to generate unique CIDR block subnets"""
    current = 0
    high = 255
    while current <= high:
        yield '10.0.%s.0/24' % current
        current += 1


def read_file(file_name):
    """Reads an entire file and returns it as a string
    Arguments
    :param file_name: A path to a file
    """
    with open(file_name, 'r') as f:
        return f.read()


def validate_cloudformation_template(template_body):
    """Validates the JSON of a CloudFormation template produced by Troposphere
    Arguments
    :param template_body: The string representation of CloudFormation template
                          JSON
    """
    c = boto.connect_cloudformation()

    return c.validate_template(template_body=template_body)
