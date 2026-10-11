pipeline {
    agent { label 'zivizip-trusted' }
    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '15'))
    }
    triggers { pollSCM('H/2 * * * *') }
    stages {
        stage('Checkout') {
            steps {
                checkout scm
                script { env.RELEASE = sh(script: 'git rev-parse HEAD', returnStdout: true).trim() }
            }
        }
        stage('Build and test') {
            steps {
                sh 'docker build --target preview -f apps/web/Dockerfile -t zivizip-web:$RELEASE .'
                sh 'docker build -f services/notes/Dockerfile -t zivizip-api:$RELEASE .'
                sh 'docker build -f deploy/jenkins/browser.Dockerfile -t zivizip-browser:$RELEASE .'
            }
        }
        stage('Browser verification') {
            steps { sh 'docker run --rm zivizip-browser:$RELEASE' }
        }
        stage('Deploy production') {
            steps {
                sh '''docker save zivizip-web:$RELEASE zivizip-api:$RELEASE | ssh -i /run/secrets/deploy_key -o IdentitiesOnly=yes -o BatchMode=yes -o UserKnownHostsFile=/run/secrets/known_hosts root@"$DEPLOY_HOST" "release $RELEASE"'''
            }
        }
    }
    post {
        always {
            sh 'if [ -n "$RELEASE" ]; then docker image rm zivizip-browser:$RELEASE zivizip-web:$RELEASE zivizip-api:$RELEASE || true; fi'
        }
    }
}
