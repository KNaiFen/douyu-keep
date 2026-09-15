using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Win32;

internal static class Program
{
    internal const string AppId = "io.github.knaifen.douyu-keep";

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        string identity = WindowsIdentity.GetCurrent().User.Value;
        string dataDirectory = Environment.GetEnvironmentVariable("DOUYU_KEEP_DATA_DIR");
        if (String.IsNullOrWhiteSpace(dataDirectory))
            dataDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "douyu-keep");
        dataDirectory = Path.GetFullPath(dataDirectory);
        if (dataDirectory.Length > Path.GetPathRoot(dataDirectory).Length)
            dataDirectory = dataDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        string suffix;
        using (SHA256 sha = SHA256.Create())
            suffix = BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(identity + dataDirectory.ToUpperInvariant()))).Replace("-", "");
        bool created;
        using (Mutex mutex = new Mutex(true, "Local\\" + AppId + suffix, out created))
        using (EventWaitHandle activate = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\" + AppId + suffix + ".activate"))
        using (EventWaitHandle stop = new EventWaitHandle(false, EventResetMode.AutoReset, "Local\\" + AppId + suffix + ".stop"))
        {
            if (Array.IndexOf(args, "--stop") >= 0)
            {
                if (created) { mutex.ReleaseMutex(); return; }
                stop.Set();
                if (mutex.WaitOne(35000)) mutex.ReleaseMutex();
                else Environment.ExitCode = 1;
                return;
            }
            if (!created) { activate.Set(); return; }
            try
            {
                using (Mutex running = new Mutex(false, "Local\\" + AppId + ".running"))
                    Application.Run(new LauncherContext(dataDirectory, Array.IndexOf(args, "--hidden") >= 0, activate, stop));
            }
            catch (Exception error)
            {
                Environment.ExitCode = 1;
                MessageBox.Show(error.Message, "douyu-keep 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
            finally { mutex.ReleaseMutex(); }
        }
    }
}

internal sealed class LauncherContext : ApplicationContext
{
    private readonly string dataDirectory;
    private readonly NotifyIcon tray;
    private readonly Control dispatcher = new Control();
    private readonly ToolStripMenuItem openItem;
    private readonly ToolStripMenuItem startupItem;
    private readonly RegisteredWaitHandle activationWait;
    private readonly RegisteredWaitHandle stopWait;
    private readonly object logLock = new object();
    private readonly System.Windows.Forms.Timer startupTimeout = new System.Windows.Forms.Timer();
    private Process backend;
    private ChildJob childJob;
    private volatile string url;
    private readonly string token;
    private bool openWhenReady;
    private bool stopping;
    private bool cleaned;

    internal LauncherContext(string directory, bool hidden, EventWaitHandle activate, EventWaitHandle stop)
    {
        dataDirectory = directory;
        Directory.CreateDirectory(dataDirectory);
        dispatcher.CreateControl();
        openWhenReady = !hidden;
        byte[] secret = new byte[32];
        using (RandomNumberGenerator rng = RandomNumberGenerator.Create()) { rng.GetBytes(secret); }
        token = BitConverter.ToString(secret).Replace("-", "").ToLowerInvariant();
        string logPath = Path.Combine(dataDirectory, "backend.log");
        if (File.Exists(logPath) && new FileInfo(logPath).Length > 2 * 1024 * 1024)
        {
            string oldLog = logPath + ".1";
            if (File.Exists(oldLog)) File.Delete(oldLog);
            File.Move(logPath, oldLog);
        }
        ContextMenuStrip menu = new ContextMenuStrip();
        openItem = new ToolStripMenuItem("正在启动...");
        openItem.Click += delegate { OpenBrowser(); };
        menu.Items.Add(openItem);
        menu.Items.Add("打开配置目录", null, delegate { OpenDirectory(); });
        menu.Items.Add(new ToolStripSeparator());
        startupItem = new ToolStripMenuItem("开机自启");
        startupItem.CheckOnClick = true;
        startupItem.Click += delegate { SetStartup(startupItem.Checked); };
        menu.Items.Add(startupItem);
        menu.Opening += delegate { startupItem.Checked = IsStartupEnabled(); };
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("退出", null, delegate { BeginStop(); });
        tray = new NotifyIcon();
        tray.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        tray.Text = "douyu-keep: 正在启动";
        tray.ContextMenuStrip = menu;
        tray.Visible = true;
        tray.DoubleClick += delegate { OpenBrowser(); };
        activationWait = ThreadPool.RegisterWaitForSingleObject(activate, delegate { Dispatch(OpenBrowser); }, null, Timeout.Infinite, false);
        stopWait = ThreadPool.RegisterWaitForSingleObject(stop, delegate { Dispatch(BeginStop); }, null, Timeout.Infinite, false);
        SystemEvents.SessionEnding += OnSessionEnding;
        try { StartBackend(); }
        catch { Cleanup(); throw; }
    }

    private void Dispatch(Action action)
    {
        if (!cleaned && !dispatcher.IsDisposed)
        {
            try { dispatcher.BeginInvoke(action); } catch (InvalidOperationException) { }
        }
    }

    private void StartBackend()
    {
        string root = Path.GetDirectoryName(Application.ExecutablePath);
        string node = Path.Combine(root, "runtime", "node.exe");
        string entry = Path.Combine(root, "app", "build", "docker", "desktop", "server.js");
        if (!File.Exists(node) || !File.Exists(entry)) throw new FileNotFoundException("安装文件不完整，请完整解压 ZIP 或重新安装。");
        ProcessStartInfo info = new ProcessStartInfo(node, "\"" + entry + "\"");
        info.WorkingDirectory = Path.Combine(root, "app");
        info.UseShellExecute = false;
        info.CreateNoWindow = true;
        info.RedirectStandardOutput = true;
        info.RedirectStandardError = true;
        info.StandardOutputEncoding = Encoding.UTF8;
        info.StandardErrorEncoding = Encoding.UTF8;
        info.EnvironmentVariables["DOUYU_KEEP_DATA_DIR"] = dataDirectory;
        info.EnvironmentVariables["DOUYU_KEEP_LAUNCHER_TOKEN"] = token;
        backend = new Process();
        backend.StartInfo = info;
        backend.EnableRaisingEvents = true;
        backend.OutputDataReceived += OnOutput;
        backend.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { WriteLog(e.Data); };
        backend.Exited += delegate { Dispatch(OnBackendExit); };
        childJob = new ChildJob();
        backend.Start();
        try { childJob.Add(backend); }
        catch { backend.Kill(); throw; }
        backend.BeginOutputReadLine();
        backend.BeginErrorReadLine();
        startupTimeout.Interval = 30000;
        startupTimeout.Tick += delegate
        {
            startupTimeout.Stop();
            if (url == null && !stopping)
            {
                MessageBox.Show("本地服务启动超时，请查看配置目录中的 backend.log。", "douyu-keep", MessageBoxButtons.OK, MessageBoxIcon.Error);
                BeginStop();
            }
        };
        startupTimeout.Start();
    }

    private void OnOutput(object sender, DataReceivedEventArgs e)
    {
        if (e.Data == null) return;
        if (e.Data.StartsWith("{\"desktopReady\":true,"))
        {
            try
            {
                var ready = new JavaScriptSerializer().Deserialize<System.Collections.Generic.Dictionary<string, object>>(e.Data);
                Uri candidate = new Uri((string)ready["url"]);
                if (candidate.Scheme != "http" || candidate.Host != "127.0.0.1" || candidate.Port < 1)
                    throw new InvalidDataException("本地服务地址无效");
                // Stop may already be waiting on the worker thread for this address.
                url = candidate.GetLeftPart(UriPartial.Authority);
                Dispatch(delegate
                {
                    if (stopping) return;
                    startupTimeout.Stop();
                    tray.Text = "douyu-keep";
                    openItem.Text = "打开 douyu-keep";
                    if (openWhenReady) OpenBrowser();
                });
                return;
            }
            catch (Exception error) { WriteLog(error.Message); }
        }
        WriteLog(e.Data);
    }

    private void WriteLog(string line)
    {
        if (line == null) return;
        try
        {
            lock (logLock)
            {
                string log = Path.Combine(dataDirectory, "backend.log");
                if (File.Exists(log) && new FileInfo(log).Length > 2 * 1024 * 1024)
                {
                    if (File.Exists(log + ".1")) File.Delete(log + ".1");
                    File.Move(log, log + ".1");
                }
                File.AppendAllText(log, line.Replace(token, "[redacted]") + Environment.NewLine, Encoding.UTF8);
            }
        }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private void OpenBrowser()
    {
        if (stopping) return;
        if (url == null) { openWhenReady = true; return; }
        try
        {
            Process.Start(new ProcessStartInfo(url + "/#web-password=" + token) { UseShellExecute = true });
        }
        catch (Exception error) { MessageBox.Show(error.Message, "无法打开默认浏览器"); }
    }

    private void OpenDirectory()
    {
        try { Process.Start(new ProcessStartInfo(dataDirectory) { UseShellExecute = true }); }
        catch (Exception error) { MessageBox.Show(error.Message, "无法打开配置目录"); }
    }

    private bool IsStartupEnabled()
    {
        using (RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run"))
            return key != null && String.Equals(key.GetValue(Program.AppId) as string, "\"" + Application.ExecutablePath + "\" --hidden", StringComparison.OrdinalIgnoreCase);
    }

    private void SetStartup(bool enabled)
    {
        try
        {
            using (RegistryKey key = Registry.CurrentUser.CreateSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Run"))
            {
                if (enabled) key.SetValue(Program.AppId, "\"" + Application.ExecutablePath + "\" --hidden");
                else key.DeleteValue(Program.AppId, false);
            }
            using (RegistryKey key = Registry.CurrentUser.OpenSubKey("Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run", true))
            { if (key != null) key.DeleteValue(Program.AppId, false); }
        }
        catch (Exception error) { MessageBox.Show(error.Message, "无法更新开机自启"); }
        startupItem.Checked = IsStartupEnabled();
    }

    private void OnBackendExit()
    {
        if (stopping) return;
        MessageBox.Show("本地服务已退出。请检查配置目录中的 backend.log 后重新启动。", "douyu-keep", MessageBoxButtons.OK, MessageBoxIcon.Error);
        BeginStop();
    }

    private void OnSessionEnding(object sender, SessionEndingEventArgs e)
    {
        Dispatch(BeginStop);
    }

    private async void BeginStop()
    {
        if (stopping) return;
        stopping = true;
        startupTimeout.Stop();
        tray.Text = "douyu-keep: 正在退出";
        foreach (ToolStripItem item in tray.ContextMenuStrip.Items) item.Enabled = false;
        await Task.Run(delegate
        {
            try
            {
                if (backend != null && !backend.HasExited)
                {
                    Stopwatch deadline = Stopwatch.StartNew();
                    while (url == null && !backend.HasExited && deadline.ElapsedMilliseconds < 30000)
                        Thread.Sleep(50);
                    if (url != null)
                    {
                        try
                        {
                            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url + "/api/desktop/shutdown");
                            request.Proxy = null;
                            request.Method = "POST";
                            request.ContentLength = 0;
                            request.Timeout = 2000;
                            request.Headers["X-Douyu-Desktop-Token"] = token;
                            using (WebResponse response = request.GetResponse()) { }
                        }
                        catch (Exception error) { WriteLog(error.Message); }
                    }
                    int remaining = (int)Math.Max(0, 30000 - deadline.ElapsedMilliseconds);
                    if (!backend.WaitForExit(remaining)) backend.Kill();
                }
            }
            catch (Exception error) { WriteLog(error.Message); }
        });
        Cleanup();
        ExitThread();
    }

    private void Cleanup()
    {
        if (cleaned) return;
        cleaned = true;
        SystemEvents.SessionEnding -= OnSessionEnding;
        activationWait.Unregister(null);
        stopWait.Unregister(null);
        startupTimeout.Dispose();
        tray.Visible = false;
        tray.Dispose();
        if (childJob != null) childJob.Dispose();
        if (backend != null) backend.Dispose();
        dispatcher.Dispose();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) Cleanup();
        base.Dispose(disposing);
    }
}

// Closing the launcher must never leave an orphaned scheduler running.
internal sealed class ChildJob : IDisposable
{
    private IntPtr handle;
    [StructLayout(LayoutKind.Sequential)]
    private struct BasicLimits
    {
        public long PerProcessUserTimeLimit, PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize, MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass, SchedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters { public ulong ReadOperations, WriteOperations, OtherOperations, ReadBytes, WriteBytes, OtherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    private struct ExtendedLimits
    {
        public BasicLimits BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit, JobMemoryLimit, PeakProcessMemoryUsed, PeakJobMemoryUsed;
    }
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr attributes, string name);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(IntPtr job, int infoClass, ref ExtendedLimits info, uint length);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    internal ChildJob()
    {
        handle = CreateJobObject(IntPtr.Zero, null);
        ExtendedLimits limits = new ExtendedLimits();
        limits.BasicLimitInformation.LimitFlags = 0x2000;
        if (handle == IntPtr.Zero || !SetInformationJobObject(handle, 9, ref limits, (uint)Marshal.SizeOf(limits)))
        { Dispose(); throw new System.ComponentModel.Win32Exception(); }
    }
    internal void Add(Process process)
    {
        if (!AssignProcessToJobObject(handle, process.Handle)) throw new System.ComponentModel.Win32Exception();
    }
    public void Dispose()
    {
        if (handle != IntPtr.Zero) { CloseHandle(handle); handle = IntPtr.Zero; }
    }
}
