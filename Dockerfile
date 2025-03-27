FROM  swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/pytorch/pytorch:2.5.1-cuda12.1-cudnn9-runtime

ADD . /project

RUN pip install -r /project/requirements.txt

WORKDIR /project

CMD ["bash", "bin/start-llm-utils.sh"]