from troposphere import (
    Base64,
    GetAtt,
    Output,
    Parameter,
    Ref,
    Tags,
    Template
)

from utils.cfn import read_file, validate_cloudformation_template
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
import troposphere.autoscaling as asg
import troposphere.elasticloadbalancing as elb
import troposphere.cloudwatch as cw

t = Template()

t.add_version('2010-09-09')
t.add_description('OpenAerialMap tiler API stack')

#
# Parameters
#
vpc_param = t.add_parameter(Parameter(
    'VpcId', Type='String', Description='ID of an existing VPC'
))

keyname_param = t.add_parameter(Parameter(
    'KeyName', Type='String', Default='hotosm',
    Description='Name of an existing EC2 key pair'
))

notification_arn_param = t.add_parameter(Parameter(
    'NotificationsARN', Type='String',
    Description='Physical resource ID of an AWS::SNS::Topic for notifications'
))

tiler_ami_param = t.add_parameter(Parameter(
    'CoreOSAMI', Type='String', Default='ami-85ada4b5',
    Description='CoreOS AMI'
))

# tiler_instance_profile_param = t.add_parameter(Parameter(
    # 'TilerInstanceProfile', Type='String',
    # Description='Physical resource ID of an AWS::IAM::Role for tiler'
# ))

tiler_instance_type_param = t.add_parameter(Parameter(
    'TilerInstanceType', Type='String', Default='t2.micro',
    Description='Tiler EC2 instance type',
    AllowedValues=EC2_INSTANCE_TYPES,
    ConstraintDescription='must be a valid EC2 instance type.'
))

public_subnets_param = t.add_parameter(Parameter(
    'PublicSubnets', Type='CommaDelimitedList',
    Description='A list of public subnets'
))

private_subnets_param = t.add_parameter(Parameter(
    'PrivateSubnets', Type='CommaDelimitedList',
    Description='A list of private subnets'
))

availability_zones_param = t.add_parameter(Parameter(
    'AvailabilityZones', Type='CommaDelimitedList',
    Default=','.join(EC2_AVAILABILITY_ZONES),
    Description='A list of availability zones'
))

#
# Security Group Resources
#
tiler_load_balancer_security_group_name = 'sgTilerLoadBalancer'
tiler_load_balancer_security_group = t.add_resource(ec2.SecurityGroup(
    tiler_load_balancer_security_group_name,
    GroupDescription='Enables access to tiler API servers via a load balancer',
    VpcId=Ref(vpc_param),
    SecurityGroupIngress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=ALLOW_ALL_CIDR, FromPort=p, ToPort=p
        )
        for p in [HTTP, HTTPS]
    ],
    SecurityGroupEgress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=VPC_CIDR, FromPort=p, ToPort=p
        )
        for p in [HTTP]
    ],
    Tags=Tags(Name=tiler_load_balancer_security_group_name)
))

tiler_security_group_name = 'sgTiler'
tiler_security_group = t.add_resource(ec2.SecurityGroup(
    tiler_security_group_name,
    GroupDescription='Enables access to tiler API servers',
    VpcId=Ref(vpc_param),
    SecurityGroupIngress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=VPC_CIDR, FromPort=p, ToPort=p
        )
        for p in [HTTP, SSH]
    ] + [
        ec2.SecurityGroupRule(
            IpProtocol='tcp', SourceSecurityGroupId=Ref(sg),
            FromPort=HTTP, ToPort=HTTP
        )
        for sg in [tiler_load_balancer_security_group]
    ],
    SecurityGroupEgress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=ALLOW_ALL_CIDR, FromPort=p, ToPort=p
        )
        for p in [HTTP, HTTPS]
    ],
    Tags=Tags(Name=tiler_security_group_name)
))

#
# ELB Resources
#
tiler_load_balancer_name = 'elbTiler'
tiler_load_balancer = t.add_resource(elb.LoadBalancer(
    tiler_load_balancer_name,
    ConnectionDrainingPolicy=elb.ConnectionDrainingPolicy(
        Enabled=True,
        Timeout=300,
    ),
    CrossZone=True,
    SecurityGroups=[Ref(tiler_load_balancer_security_group)],
    Listeners=[
        elb.Listener(
            LoadBalancerPort=str(HTTP),
            InstancePort=str(HTTP),
            Protocol='HTTP',
        )
    ],
    HealthCheck=elb.HealthCheck(
        Target='HTTP:80/',
        HealthyThreshold='3',
        UnhealthyThreshold='2',
        Interval='30',
        Timeout='5',
    ),
    Subnets=Ref(public_subnets_param),
    Tags=Tags(Name=tiler_load_balancer_name)
))

#
# Auto Scaling Group Resources
#
tiler_launch_config = t.add_resource(asg.LaunchConfiguration(
    'lcTiler',
    ImageId=Ref(tiler_ami_param),
    # IamInstanceProfile=Ref(tiler_instance_profile_param),
    InstanceType=Ref(tiler_instance_type_param),
    KeyName=Ref(keyname_param),
    SecurityGroups=[Ref(tiler_security_group)],
    UserData=Base64(read_file('cloud-config/oam-tiler-api.yml'))
))

tiler_auto_scaling_group = t.add_resource(asg.AutoScalingGroup(
    'asgTiler',
    AvailabilityZones=Ref(availability_zones_param),
    Cooldown=300,
    DesiredCapacity=1,
    HealthCheckGracePeriod=600,
    HealthCheckType='ELB',
    LaunchConfigurationName=Ref(tiler_launch_config),
    LoadBalancerNames=[Ref(tiler_load_balancer)],
    MaxSize=10,
    MinSize=1,
    NotificationConfigurations=[asg.NotificationConfigurations(
        TopicARN=Ref(notification_arn_param),
        NotificationTypes=[
            asg.EC2_INSTANCE_LAUNCH,
            asg.EC2_INSTANCE_LAUNCH_ERROR,
            asg.EC2_INSTANCE_TERMINATE,
            asg.EC2_INSTANCE_TERMINATE_ERROR
        ]
    )],
    VPCZoneIdentifier=Ref(private_subnets_param),
    Tags=[asg.Tag('Name', 'Tiler', True)]
))

#
# CloudWatch Resources
#
t.add_resource(cw.Alarm(
    'alarmTilerBackend4XX',
    AlarmDescription='Tiler API server backend 4XXs',
    AlarmActions=[Ref(notification_arn_param)],
    Statistic='Sum',
    Period=300,
    Threshold='20',
    EvaluationPeriods=1,
    ComparisonOperator='GreaterThanThreshold',
    MetricName='HTTPCode_Backend_4XX',
    Namespace='AWS/ELB',
    Dimensions=[
        cw.MetricDimension(
            'metricLoadBalancerName',
            Name='LoadBalancerName',
            Value=Ref(tiler_load_balancer)
        )
    ],
))

t.add_resource(cw.Alarm(
    'alarmTilerBackend5XX',
    AlarmDescription='Tiler API server backend 5XXs',
    AlarmActions=[Ref(notification_arn_param)],
    Statistic='Sum',
    Period=60,
    Threshold='0',
    EvaluationPeriods=1,
    ComparisonOperator='GreaterThanThreshold',
    MetricName='HTTPCode_Backend_5XX',
    Namespace='AWS/ELB',
    Dimensions=[
        cw.MetricDimension(
            'metricLoadBalancerName',
            Name='LoadBalancerName',
            Value=Ref(tiler_load_balancer)
        )
    ],
))

#
# Outputs
#
t.add_output([
    Output('ServerLoadBalancerEndpoint',
           Description='Server load balancer server endpoint',
           Value=GetAtt(tiler_load_balancer, 'DNSName'))
])

if __name__ == '__main__':
    template_json = t.to_json()
    file_name = __file__.replace('.py', '.json')

    validate_cloudformation_template(template_json)

    with open(file_name, 'w') as f:
        f.write(template_json)

    print('Template validated and written to %s' % file_name)
