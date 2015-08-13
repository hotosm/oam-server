from troposphere import (
    Base64,
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

t = Template()

t.add_version('2010-09-09')
t.add_description('OpenAerialMap SWF decider and activity worker stack')

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

coreos_ami_param = t.add_parameter(Parameter(
    'CoreOSAMI', Type='String', Default='ami-85ada4b5',
    Description='CoreOS AMI'
))

# decider_instance_profile_param = t.add_parameter(Parameter(
    # 'DeciderInstanceProfile', Type='String',
    # Description='Physical resource ID of an AWS::IAM::Role for decider'
# ))

decider_instance_type_param = t.add_parameter(Parameter(
    'DeciderInstanceType', Type='String', Default='t2.micro',
    Description='Decider EC2 instance type',
    AllowedValues=EC2_INSTANCE_TYPES,
    ConstraintDescription='must be a valid EC2 instance type.'
))


# activity_worker_instance_profile_param = t.add_parameter(Parameter(
    # 'ActivityWorkerInstanceProfile', Type='String',
    # Description='Physical resource ID of an AWS::IAM::Role for activity worker'
# ))

activity_worker_instance_type_param = t.add_parameter(Parameter(
    'ActivityWorkerInstanceType', Type='String', Default='t2.micro',
    Description='Activity worker EC2 instance type',
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
decider_security_group_name = 'sgDecider'
decider_security_group = t.add_resource(ec2.SecurityGroup(
    decider_security_group_name,
    GroupDescription='Enables access to decider servers',
    VpcId=Ref(vpc_param),
    SecurityGroupIngress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=VPC_CIDR, FromPort=p, ToPort=p
        )
        for p in [SSH]
    ],
    SecurityGroupEgress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=ALLOW_ALL_CIDR, FromPort=p, ToPort=p
        )
        for p in [HTTP, HTTPS]
    ],
    Tags=Tags(Name=decider_security_group_name)
))

activity_worker_security_group_name = 'sgActivityWorker'
activity_worker_security_group = t.add_resource(ec2.SecurityGroup(
    activity_worker_security_group_name,
    GroupDescription='Enables access to activity worker servers',
    VpcId=Ref(vpc_param),
    SecurityGroupIngress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=VPC_CIDR, FromPort=p, ToPort=p
        )
        for p in [SSH]
    ],
    SecurityGroupEgress=[
        ec2.SecurityGroupRule(
            IpProtocol='tcp', CidrIp=ALLOW_ALL_CIDR, FromPort=p, ToPort=p
        )
        for p in [HTTP, HTTPS]
    ],
    Tags=Tags(Name=activity_worker_security_group_name)
))

#
# Auto Scaling Group Resources
#
decider_launch_config = t.add_resource(asg.LaunchConfiguration(
    'lcDecider',
    ImageId=Ref(coreos_ami_param),
    # IamInstanceProfile=Ref(decider_instance_profile_param),
    InstanceType=Ref(decider_instance_type_param),
    KeyName=Ref(keyname_param),
    SecurityGroups=[Ref(decider_security_group)],
    UserData=Base64(read_file('cloud-config/oam-decider.yml'))
))

decider_auto_scaling_group = t.add_resource(asg.AutoScalingGroup(
    'asgDecider',
    AvailabilityZones=Ref(availability_zones_param),
    Cooldown=300,
    DesiredCapacity=1,
    HealthCheckGracePeriod=600,
    HealthCheckType='EC2',
    LaunchConfigurationName=Ref(decider_launch_config),
    MaxSize=1,
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
    Tags=[asg.Tag('Name', 'Decider', True)]
))

activity_worker_launch_config = t.add_resource(asg.LaunchConfiguration(
    'lcActivityWorker',
    ImageId=Ref(coreos_ami_param),
    # IamInstanceProfile=Ref(activity_worker_instance_profile_param),
    InstanceType=Ref(activity_worker_instance_type_param),
    KeyName=Ref(keyname_param),
    SecurityGroups=[Ref(activity_worker_security_group)],
    UserData=Base64(read_file('cloud-config/oam-activity-worker.yml'))
))

decider_auto_scaling_group = t.add_resource(asg.AutoScalingGroup(
    'asgActivityWorker',
    AvailabilityZones=Ref(availability_zones_param),
    Cooldown=300,
    DesiredCapacity=1,
    HealthCheckGracePeriod=600,
    HealthCheckType='EC2',
    LaunchConfigurationName=Ref(activity_worker_launch_config),
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
    Tags=[asg.Tag('Name', 'ActivityWorker', True)]
))


if __name__ == '__main__':
    template_json = t.to_json()
    file_name = __file__.replace('.py', '.json')

    validate_cloudformation_template(template_json)

    with open(file_name, 'w') as f:
        f.write(template_json)

    print('Template validated and written to %s' % file_name)
