from troposphere import (
    Join,
    Output,
    Parameter,
    Tags,
    Ref,
    Template
)

from utils.cfn import (
    get_subnet_cidr_block,
    validate_cloudformation_template
)
from utils.constants import (
    ALLOW_ALL_CIDR,
    EC2_AVAILABILITY_ZONES,
    EC2_INSTANCE_TYPES,
    VPC_CIDR,
)
from utils.constants import (
    HTTP,
    HTTPS,
    SSH
)

import troposphere.ec2 as ec2

t = Template()

t.add_version('2010-09-09')
t.add_description('OpenAerialMap VPC stack')

#
# Parameters
#
keyname_param = t.add_parameter(Parameter(
    'KeyName', Type='String', Default='hotosm',
    Description='Name of an existing EC2 key pair'
))

nat_ami_param = t.add_parameter(Parameter(
    'NATInstanceAMI', Type='String', Default='ami-69ae8259',
    Description='NAT EC2 Instance AMI'
))

nat_instance_type_param = t.add_parameter(Parameter(
    'NATInstanceType', Type='String', Default='t2.micro',
    Description='NAT EC2 instance type',
    AllowedValues=EC2_INSTANCE_TYPES,
    ConstraintDescription='must be a valid EC2 instance type.'
))

bastion_ami_param = t.add_parameter(Parameter(
    'BastionInstanceAMI', Type='String', Default='ami-85ada4b5',
    Description='Bastion EC2 Instance AMI'
))

bastion_instance_type_param = t.add_parameter(Parameter(
    'BastionInstanceType', Type='String', Default='t2.micro',
    Description='Bastion EC2 instance type',
    AllowedValues=EC2_INSTANCE_TYPES,
    ConstraintDescription='must be a valid EC2 instance type.'
))


#
# VPC Resources
#
vpc = t.add_resource(ec2.VPC(
    'OAMVPC', CidrBlock=VPC_CIDR, EnableDnsSupport=True,
    EnableDnsHostnames=True,
    Tags=Tags(Name='OAMVPC')
))

gateway = t.add_resource(ec2.InternetGateway(
    'InternetGateway', Tags=Tags(Name='InternetGateway')
))

gateway_attachment = t.add_resource(ec2.VPCGatewayAttachment(
    'VPCGatewayAttachment', VpcId=Ref(vpc), InternetGatewayId=Ref(gateway)
))

public_route_table_name = 'PublicRouteTable'
public_route_table = t.add_resource(ec2.RouteTable(
    public_route_table_name, VpcId=Ref(vpc),
    Tags=Tags(Name=public_route_table_name)
))

t.add_resource(ec2.Route(
    'PublicRoute', RouteTableId=Ref(public_route_table),
    DestinationCidrBlock=ALLOW_ALL_CIDR,
    DependsOn=gateway_attachment.title, GatewayId=Ref(gateway)
))

#
# Security Group Resources
#
nat_security_group_name = 'sgNAT'
nat_security_group = t.add_resource(ec2.SecurityGroup(
    nat_security_group_name,
    GroupDescription='Enables access to the NAT devices', VpcId=Ref(vpc),
    SecurityGroupIngress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=ALLOW_ALL_CIDR, FromPort=p, ToPort=p
        )
        for p in [HTTP, HTTPS]
    ],
    SecurityGroupEgress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=ALLOW_ALL_CIDR, FromPort=p, ToPort=p
        )
        for p in [HTTP, HTTPS]
    ],
    Tags=Tags(Name=nat_security_group_name)
))

bastion_security_group_name = 'sgBastion'
bastion_security_group = t.add_resource(ec2.SecurityGroup(
    bastion_security_group_name,
    GroupDescription='Enables access to the BastionHost',
    VpcId=Ref(vpc),
    SecurityGroupIngress=[
        ec2.SecurityGroupRule(IpProtocol='tcp',
                              CidrIp=ALLOW_ALL_CIDR,
                              FromPort=p, ToPort=p)
        for p in [SSH]
    ],
    SecurityGroupEgress=[
        ec2.SecurityGroupRule(IpProtocol='tcp',
                              CidrIp=ALLOW_ALL_CIDR,
                              FromPort=p, ToPort=p)
        for p in [HTTP, HTTPS, SSH]
    ],
    Tags=Tags(Name=bastion_security_group_name)
))

cidr_generator = get_subnet_cidr_block()
public_subnets = []
private_subnets = []

for index, availability_zone in enumerate(EC2_AVAILABILITY_ZONES):
    public_subnet_name = '%sPublicSubnet' % availability_zone.title().replace('-', '')  # NOQA
    public_subnet = t.add_resource(ec2.Subnet(
        public_subnet_name, VpcId=Ref(vpc), CidrBlock=cidr_generator.next(),
        AvailabilityZone=availability_zone,
        Tags=Tags(Name=public_subnet_name)
    ))

    t.add_resource(ec2.SubnetRouteTableAssociation(
        '%sPublicRouteTableAssociation' % public_subnet.title,
        SubnetId=Ref(public_subnet),
        RouteTableId=Ref(public_route_table)
    ))

    if index == 0:
        bastion_name = 'BastionHost'
        bastion = t.add_resource(ec2.Instance(
            bastion_name, InstanceType=Ref(bastion_instance_type_param),
            KeyName=Ref(keyname_param), ImageId=Ref(bastion_ami_param),
            NetworkInterfaces=[
                ec2.NetworkInterfaceProperty(
                    Description='ENI for BastionHost',
                    GroupSet=[Ref(bastion_security_group)],
                    SubnetId=Ref(public_subnet),
                    AssociatePublicIpAddress=True,
                    DeviceIndex=0,
                    DeleteOnTermination=True
                )
            ],
            Tags=Tags(Name=bastion_name)
        ))

    nat_device = t.add_resource(ec2.Instance(
        '%sNATDevice' % availability_zone.title().replace('-', ''),
        InstanceType=Ref(nat_instance_type_param),
        KeyName=Ref(keyname_param), SourceDestCheck=False,
        ImageId=Ref(nat_ami_param),
        NetworkInterfaces=[
            ec2.NetworkInterfaceProperty(
                Description='ENI for NATDevice',
                GroupSet=[Ref(nat_security_group)],
                SubnetId=Ref(public_subnet),
                AssociatePublicIpAddress=True,
                DeviceIndex=0,
                DeleteOnTermination=True,
            )
        ],
        Tags=Tags(Name='NATDevice')
    ))

    private_subnet_name = '%sPrivateSubnet' % availability_zone.title().replace('-', '')  # NOQA
    private_subnet = t.add_resource(ec2.Subnet(
        private_subnet_name, VpcId=Ref(vpc), CidrBlock=cidr_generator.next(),
        AvailabilityZone=availability_zone,
        Tags=Tags(Name=private_subnet_name)
    ))

    private_route_table_name = '%sPrivateRouteTable' % availability_zone.title().replace('-', '')  # NOQA
    private_route_table = t.add_resource(ec2.RouteTable(
        private_route_table_name, VpcId=Ref(vpc),
        Tags=Tags(Name=private_route_table_name)
    ))

    private_route = t.add_resource(ec2.Route(
        '%sPrivateRoute' % availability_zone.title().replace('-', ''),
        RouteTableId=Ref(private_route_table),
        DestinationCidrBlock=ALLOW_ALL_CIDR, InstanceId=Ref(nat_device)
    ))

    t.add_resource(ec2.SubnetRouteTableAssociation(
        '%sPrivateSubnetRouteTableAssociation' % private_subnet.title,
        SubnetId=Ref(private_subnet),
        RouteTableId=Ref(private_route_table)
    ))

    public_subnets.append(public_subnet)
    private_subnets.append(private_subnet)

#
# Outputs
#
t.add_output([
    Output('VpcId', Description='VPC ID', Value=Ref(vpc)),
    Output('PublicSubnets', Description='A list of public subnets',
           Value=Join(',', [Ref(s) for s in public_subnets])),
    Output('PrivateSubnets', Description='A list of private subnets',
           Value=Join(',', [Ref(s) for s in private_subnets]))
])

if __name__ == '__main__':
    template_json = t.to_json()
    file_name = __file__.replace('.py', '.json')

    validate_cloudformation_template(template_json)

    with open(file_name, 'w') as f:
        f.write(template_json)

    print('Template validated and written to %s' % file_name)
