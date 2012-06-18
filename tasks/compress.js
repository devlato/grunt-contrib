/**
* Task: compress
* Description: Compress files
* Dependencies: zipstream / tar / fstream
* Contributor(s): @ctalkington / @tkellen
* Inspired by: @jzaefferer (jquery-validation)
*/

module.exports = function(grunt) {
  var _ = grunt.utils._;
  var async = grunt.utils.async;

  grunt.registerMultiTask("compress", "Compress files.", function() {
    var options = grunt.helper("options", this, {mode: null, basePath: null, level: 1});
    var supported = ["zip", "tar", "tgz", "gzip"];
    var helper = options.mode + "Helper";
    var data = this.data;
    var done = this.async();

    if (options.basePath !== null) {
      options.basePath = _(options.basePath).rtrim("/");
    }

    if (options.mode == 'tgz') {
      helper = "tarHelper";
    }

    if (_.include(supported, options.mode) === false) {
      grunt.log.error("Mode " + options.mode + " not supported.");
      done();
      return;
    }

    async.forEachSeries(_.keys(data.files),function(dest, next) {
      var src = data.files[dest];
      var dest = grunt.template.process(dest);

      if (_.isArray(src)) {
        _.each(src, function(s, k) {
          src[k] = grunt.template.process(s);
        });
      } else {
        src = grunt.template.process(src);
      }

      var srcFiles = grunt.file.expandFiles(src);

      if (options.mode == 'gzip' && _.size(srcFiles) > 1) {
        grunt.warn("Cannot specify multiple input files for gzip compression.");
        srcFiles = srcFiles[0];
      }

      grunt.helper(helper, srcFiles, dest, options, function(error, written) {
        if (error === null) {
          grunt.log.writeln('File "' + dest + '" created (' + written + ' bytes written).');
        } else {
          grunt.log.error(error);
          grunt.fail.warn("Mode " + options.mode + " failed.");
        }

        next();
      });

    }, function() {
      done();
    });
  });

  grunt.registerHelper("zipHelper", function(files, dest, options, callback) {
    var fs = require("fs");
    var zip = require("zipstream").createZip(options);
    var destdir = _(dest).strLeftBack("/");

    if (require("path").existsSync(destdir) === false) {
      grunt.file.mkdir(destdir);
    }

    zip.pipe(fs.createWriteStream(dest));

    function addFile(){
      if (!files.length) {
        zip.finalize(function(written) {
          callback(null, written);
        });
        return;
      }

      var filepath = files.shift();
      var filename = _(filepath).strRightBack("/");
      var internal = _(filepath).strLeftBack("/");

      if (options.basePath !== null) {
        internal = _(internal).strRightBack(options.basePath);
      }

      internal = internal + "/" + filename;

      grunt.verbose.writeln("Adding " + filepath + " to zip.");
      zip.addFile(fs.createReadStream(filepath), {name: internal}, addFile);
    }

    addFile();
  });

  grunt.registerHelper("tarHelper", function(files, dest, options, callback) {
    var fstream = require("fstream");
    var tar = require("tar");
    var zlib = require("zlib");
    var destdir = _(dest).strLeftBack("/");
    var destfile = _(dest).strRight("/");
    var tempdir = destdir + "/tar_temp";
    var tardir = _(destfile).strLeftBack(".");

    function getSize(filename) {
      try {
        return require("fs").statSync(filename).size;
      } catch (e) {
        return 0;
      }
    }

    // support tar.gz naming when getting root folder for tar
    if (_(tardir).strRightBack(".") === "tar") {
      tardir = _(tardir).strLeftBack(".");
    }

    tardir = tempdir + "/" + tardir;

    if (require("path").existsSync(destdir) === false) {
      grunt.file.mkdir(destdir);
    }

    _.each(files, function(filepath) {
      var filename = _(filepath).strRightBack("/");
      var internal = _(filepath).strLeftBack("/");

      if (options.basePath !== null) {
        internal = _(internal).strRightBack(options.basePath);
      }

      internal = internal + "/" + filename;

      grunt.verbose.writeln("Adding " + filepath + " to tar.");
      grunt.file.copy(filepath, tardir + internal);
    })

    var reader = fstream.Reader({path: tardir, type: "Directory"});
    var packer = tar.Pack();
    var gzipper = zlib.createGzip();
    var writer = fstream.Writer(dest);

    if (options.mode == 'tgz') {
      var tard = reader.pipe(packer).pipe(gzipper).pipe(writer);
    } else {
      var tard = reader.pipe(packer).pipe(writer);
    }

    tard.on("error", function(e) {
      callback(e, null);
    });

    tard.on("close", function() {
      grunt.helper("clean", tempdir);
      callback(null, getSize(dest));
    });
  });

  grunt.registerHelper("gzipHelper", function(file, dest, options, callback) {
    var zlib = require("zlib");
    var destdir = _(dest).strLeftBack("/");

    if (require("path").existsSync(destdir) === false) {
      grunt.file.mkdir(destdir);
    }

    zlib.gzip(grunt.file.read(file), function(error, result) {
      if (!error) {
        grunt.file.write(dest, result);
        callback(null, result.length);
      } else {
        callback(error, null);
      }
    });
  });
};