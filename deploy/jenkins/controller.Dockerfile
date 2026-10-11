FROM jenkins/jenkins:lts-jdk21
USER root
RUN mkdir /bootstrap && chown jenkins:jenkins /bootstrap
USER jenkins
RUN jenkins-plugin-cli --plugins workflow-aggregator git timestamper
COPY init.groovy /usr/share/jenkins/ref/init.groovy.d/bootstrap.groovy
