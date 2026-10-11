import jenkins.model.Jenkins
import hudson.security.HudsonPrivateSecurityRealm
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.slaves.DumbSlave
import hudson.slaves.JNLPLauncher
import hudson.slaves.RetentionStrategy
import hudson.model.Node
import org.jenkinsci.plugins.workflow.job.WorkflowJob
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
import hudson.plugins.git.GitSCM
import hudson.plugins.git.UserRemoteConfig
import hudson.plugins.git.BranchSpec

def j = Jenkins.get()
j.setNumExecutors(0)
if (!(j.securityRealm instanceof HudsonPrivateSecurityRealm)) {
    def realm = new HudsonPrivateSecurityRealm(false)
    realm.createAccount('zivi', new File('/run/secrets/admin_password').text.trim())
    j.setSecurityRealm(realm)
    def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
    strategy.setAllowAnonymousRead(false)
    j.setAuthorizationStrategy(strategy)
}
if (j.getNode('zivizip-builder') == null) {
    def agent = new DumbSlave('zivizip-builder', '/home/jenkins/agent', new JNLPLauncher(true))
    agent.setNumExecutors(1)
    agent.setLabelString('zivizip-trusted')
    agent.setMode(Node.Mode.EXCLUSIVE)
    agent.setRetentionStrategy(new RetentionStrategy.Always())
    j.addNode(agent)
}
new File('/bootstrap/agent-secret').text = j.getComputer('zivizip-builder').getJnlpMac()
if (j.getItem('zivizip-main') == null) {
    def job = j.createProject(WorkflowJob, 'zivizip-main')
    def scm = new GitSCM([new UserRemoteConfig('https://github.com/zivimoch/zivizip.git', null, null, null)], [new BranchSpec('*/main')], false, [], null, null, [])
    job.setDefinition(new CpsScmFlowDefinition(scm, 'Jenkinsfile'))
    job.save()
}
j.save()
